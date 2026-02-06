// TODO (Phase 5 cleanup): Once all state updates flow through fine-grained events,
// completely remove the 'lobby_updated' event from ServerToClientEvents

import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import type { RequestHandler } from 'express';
import { ClientToServerEvents, ServerToClientEvents, TeamType } from '../shared/gameEvents.js';
import { gameState, setGameStateIO } from './gameState.js';
import {
  sessionManager,
  estimationManager,
  combatManager,
  progressionManager,
  phaseCoordinator,
  eventBus,
  initializeClientEventEmitter,
  getClientEventEmitter,
  LobbyNotFoundError,
  PlayerNotFoundError,
  PlayerNotHostError,
  ReconnectionFailedError,
  SessionError,
  EstimationNotActiveError,
  VoteNotEligibleError,
  InvalidVoteValueError,
  NotInDiscussionPhaseError,
  ForceEstimateTieError,
  InvalidForcedValueError,
  CombatNotActiveError,
  PlayerNotInCombatError,
  RevivalNotAllowedError,
  NotHealerClassError,
} from './domains/index.js';

type InterServerEvents = {};
type SocketData = {
  playerId?: string;
  lobbyId?: string;
  userId?: number; // Authenticated user ID
  username?: string; // Authenticated username
};

export function setupWebSocket(httpServer: HTTPServer, sessionMiddleware?: RequestHandler | null) {
  // Configure CORS based on environment
  const isReplitDeployment = process.env.REPLIT_DEPLOYMENT === '1';
  const isReplitPreview = process.env.REPLIT_DEV_DOMAIN && !isReplitDeployment;

  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : (process.env.NODE_ENV === 'production' || isReplitDeployment
        ? ['https://scrummonsters.com', 'https://www.scrummonsters.com']
        : '*');

  // Replit-specific: More aggressive timeouts due to proxy layer
  const pingTimeout = isReplitDeployment ? 90000 : 60000; // 90s for Replit production
  const pingInterval = isReplitDeployment ? 30000 : 25000; // 30s for Replit production
  const connectTimeout = isReplitDeployment ? 60000 : 45000; // 60s for Replit production

  const io = new SocketIOServer<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(httpServer, {
    cors: {
      origin: allowedOrigins,
      methods: ["GET", "POST"],
      credentials: true
    },
    // Replit-optimized timeout configuration
    pingTimeout,
    pingInterval,
    connectTimeout,
    transports: ['websocket', 'polling'], // Fallback to polling if websocket fails
    allowUpgrades: true, // Allow upgrading from polling to websocket
    perMessageDeflate: false, // Disable compression for better performance
    httpCompression: false,
    // Handle proxy headers (critical for Replit)
    path: '/socket.io/',
    serveClient: false,
    // Replit-specific: Trust proxy headers
    allowEIO3: true, // Support older clients
    cookie: false, // Disable cookies for stateless scaling
    // Max HTTP buffer size for polling fallback
    maxHttpBufferSize: 1e6, // 1MB
    // Replit autoscale: Be more forgiving with upgrades
    upgradeTimeout: 30000
  });

  console.log(`🔌 WebSocket server initialized (Replit: ${isReplitDeployment ? 'Production' : isReplitPreview ? 'Preview' : 'Local'})`);
  console.log(`   - Ping interval: ${pingInterval}ms`);
  console.log(`   - Ping timeout: ${pingTimeout}ms`);
  console.log(`   - Connect timeout: ${connectTimeout}ms`);

  // Share session with Socket.IO for authenticated user detection
  if (sessionMiddleware) {
    io.engine.use(sessionMiddleware);
    console.log(`🔐 Session middleware attached to Socket.IO`);
  }

  // Pass the io instance to GameState for emitting events
  setGameStateIO(io);

  // Initialize ClientEventEmitter for fine-grained event delivery
  const clientEventEmitter = initializeClientEventEmitter(io);
  console.log('ClientEventEmitter initialized for fine-grained events');

  // ==========================================================================
  // EVENT BUS SUBSCRIPTIONS - Phase transition handlers
  // ==========================================================================

  // Handle discussion_ended to transition to next_level or victory
  eventBus.on('estimation:discussion_ended', (payload) => {
    const { lobbyId, finalEstimate } = payload;
    const lobby = sessionManager.getLobby(lobbyId);
    if (!lobby) return;

    // Apply estimate to current ticket
    if (lobby.currentTicket) {
      lobby.currentTicket.storyPoints = finalEstimate;

      // Add to completed tickets
      if (!lobby.completedTickets) lobby.completedTickets = [];
      lobby.completedTickets.push({
        id: lobby.currentTicket.id,
        title: lobby.currentTicket.title,
        description: lobby.currentTicket.description,
        storyPoints: finalEstimate,
        completedAt: new Date().toISOString(),
        teamBreakdown: {
          developers: { participated: true, consensusScore: finalEstimate },
          qa: { participated: true, consensusScore: finalEstimate },
        },
      });
    }

    // Determine next phase via PhaseCoordinator
    const currentIndex = lobby.tickets?.findIndex(t => t.id === lobby.currentTicket?.id) ?? -1;
    const remainingTickets = lobby.tickets?.slice(currentIndex + 1) ?? [];

    if (remainingTickets.length > 0) {
      // More tickets - transition to next_level phase
      phaseCoordinator.transitionTo(lobby, 'next_level', {
        reason: 'discussion_ended_more_tickets',
        initiator: 'system'
      });
      eventBus.emit('session:phase_changed', {
        lobbyId,
        oldPhase: 'discussion',
        newPhase: 'next_level',
      });
    } else {
      // No more tickets - transition to victory
      phaseCoordinator.transitionTo(lobby, 'victory', {
        reason: 'discussion_ended_all_complete',
        initiator: 'system'
      });
      eventBus.emit('session:phase_changed', {
        lobbyId,
        oldPhase: 'discussion',
        newPhase: 'victory',
      });
    }

    // Keep lobby_updated: phase transitions need full state for completedTickets and currentTicket updates
    io.to(lobbyId).emit('lobby_updated', { lobby });
    console.log(`Discussion ended in lobby ${lobbyId}: transitioned to ${lobby.gamePhase}`);
  });

  // Connection monitoring for Replit
  let totalConnections = 0;
  let activeConnections = 0;
  let disconnectReasons = new Map<string, number>();

  // Log connection stats every 5 minutes
  setInterval(() => {
    const connectedSockets = Array.from(io.sockets.sockets.values());
    const hostConnections = connectedSockets.filter(s => {
      const lobby = sessionManager.getPlayerLobby(s.data.playerId || '');
      return lobby && lobby.hostId === s.data.playerId;
    });

    console.log('📊 Connection Statistics:');
    console.log(`   - Total connections since start: ${totalConnections}`);
    console.log(`   - Currently active: ${activeConnections}`);
    console.log(`   - Host connections: ${hostConnections.length}`);
    console.log(`   - Active lobbies: ${(sessionManager as any).lobbies?.size || 0}`);

    if (disconnectReasons.size > 0) {
      console.log('   - Disconnect reasons:');
      disconnectReasons.forEach((count, reason) => {
        console.log(`     - ${reason}: ${count}`);
      });
    }
  }, 5 * 60 * 1000);

  // Set up revival completion watchdog
  setInterval(() => {
    const completedRevivals = (gameState as any).processRevivalSessions();
    for (const revival of completedRevivals) {
      io.to(revival.lobbyId).emit('revive_complete', {
        targetId: revival.targetId,
        reviverId: revival.reviverId
      });
    }
  }, 100);

  io.on('connection', (socket: Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>) => {
    totalConnections++;
    activeConnections++;

    // Log connection details
    const transport = socket.conn.transport.name;
    const headers = socket.handshake.headers;
    const userAgent = headers['user-agent'] || 'unknown';
    const forwardedFor = headers['x-forwarded-for'] || socket.handshake.address;

    // Extract authenticated user from session (if available)
    // The session is attached via express-session middleware sharing
    const req = socket.request as any;
    if (req.session?.passport?.user) {
      const userId = req.session.passport.user;
      socket.data.userId = userId;
      console.log(`🔐 Authenticated user connected: userId=${userId}`);
    }

    console.log(`✅ Player connected: ${socket.id}`);
    console.log(`   - Transport: ${transport}`);
    console.log(`   - IP: ${forwardedFor}`);
    console.log(`   - User-Agent: ${userAgent.substring(0, 50)}...`);
    console.log(`   - Active connections: ${activeConnections}`);
    console.log(`   - Authenticated: ${socket.data.userId ? `Yes (${socket.data.userId})` : 'No (guest)'}`);

    socket.on('create_lobby', ({ lobbyName, hostName, initialSettings }) => {
      try {
        const lobby = sessionManager.createLobby(hostName, lobbyName, initialSettings);

        // Sync player-lobby mapping to gameState for battle functions
        gameState.syncPlayerToLobby(lobby.hostId, lobby);

        // Get the correct host based on environment
        const isReplitDeployment = process.env.REPLIT_DEPLOYMENT === '1';
        const isReplitPreview = process.env.REPLIT_DEV_DOMAIN && !isReplitDeployment;
        const isLocalDevelopment = !isReplitDeployment && !isReplitPreview;

        let host: string;
        if (isReplitDeployment) {
          // Published/Production environment on Replit
          host = 'https://scrummonsters.com';
        } else if (isReplitPreview) {
          // Replit preview/development environment
          host = `https://${process.env.REPLIT_DEV_DOMAIN}`;
        } else {
          // Local development - use configured port
          const port = process.env.PORT || '5001';
          host = `http://localhost:${port}`;
        }
        const inviteLink = `${host}/join/${lobby.id}`;

        // Store player-socket mapping
        socket.data.playerId = lobby.hostId;
        socket.data.lobbyId = lobby.id;

        // Join socket room
        socket.join(lobby.id);

        // Generate reconnect token for the host
        const reconnectToken = sessionManager.generateReconnectToken(lobby.hostId, lobby.id, hostName);

        socket.emit('lobby_created', { lobby, inviteLink });
        socket.emit('lobby_sync', {
          lobby,
          yourPlayer: lobby.players[0],
          reconnectToken,
          pendingActions: {},
          stateChanges: {}
        });

        // Send full state event for fine-grained event system initialization
        const emitter = getClientEventEmitter();
        emitter.sendFullState(lobby.id, lobby, socket.id);

        console.log(`Lobby created: ${lobby.id} by ${hostName}`);
      } catch (error) {
        console.error('Error creating lobby:', error);
        if (error instanceof SessionError) {
          socket.emit('game_error', { message: error.message });
        } else {
          socket.emit('game_error', { message: 'Failed to create lobby' });
        }
      }
    });

    socket.on('join_lobby', ({ lobbyId, playerName }) => {
      try {
        // Join socket room FIRST so player receives their own session:player_joined event
        socket.join(lobbyId);

        const { lobby, player } = sessionManager.joinLobby(lobbyId, playerName);

        // Sync player-lobby mapping to gameState for battle functions
        gameState.syncPlayerToLobby(player.id, lobby);

        // Store player-socket mapping
        socket.data.playerId = player.id;
        socket.data.lobbyId = lobby.id;

        // Generate reconnect token for the joining player
        const reconnectToken = sessionManager.generateReconnectToken(player.id, lobby.id, player.name);

        // Handle late joiners - emit appropriate events based on current lobby phase
        const currentPhase = lobby.gamePhase;

        if (currentPhase === 'lobby' || currentPhase === 'avatar_selection') {
          // Normal flow - player goes through avatar selection first
          socket.emit('lobby_joined', { lobby, player });
        } else {
          // Late joiner - skip directly to current phase
          console.log(`⚡ Late joiner ${playerName} joining active ${currentPhase} phase`);

          // Emit lobby_joined first for state setup
          socket.emit('lobby_joined', { lobby, player });

          // Then immediately emit the phase-specific event to advance them
          if (currentPhase === 'battle' || currentPhase === 'discussion' || currentPhase === 'reveal') {
            // Emit battle_started to transition client to battle screen
            if (lobby.boss) {
              socket.emit('battle_started', { lobby, boss: lobby.boss });
              console.log(`🎮 Late joiner ${playerName} advanced to battle phase`);
            }
          }
        }

        socket.emit('lobby_sync', {
          lobby,
          yourPlayer: player,
          reconnectToken,
          pendingActions: {},
          stateChanges: {}
        });

        // Send full state event for fine-grained event system initialization
        const emitter = getClientEventEmitter();
        emitter.sendFullState(lobby.id, lobby, socket.id);

        // Notify other players about the new player joining (for dropping animation)
        socket.to(lobby.id).emit('player_joined', { player, lobby });

        // Removed lobby_updated: session:player_joined event emitted by sessionManager.joinLobby

        console.log(`Player ${playerName} joined lobby ${lobbyId} in phase ${currentPhase}`);
      } catch (error) {
        if (error instanceof LobbyNotFoundError) {
          socket.emit('game_error', { message: 'Lobby not found' });
        } else if (error instanceof SessionError) {
          socket.emit('game_error', { message: error.message });
        } else {
          console.error('Unexpected error in join_lobby:', error);
          socket.emit('game_error', { message: 'Failed to join lobby' });
        }
      }
    });

    socket.on('select_avatar', ({ avatarClass }) => {
      const playerId = socket.data.playerId;
      if (!playerId) return;

      // Track activity for host transfer selection
      sessionManager.recordPlayerActivity(playerId);

      try {
        const lobby = sessionManager.selectAvatar(playerId, avatarClass);

        // Emit legacy event for App.tsx state transition
        io.to(lobby.id).emit('avatar_selected', { playerId, avatar: avatarClass });

        // Emit fine-grained event for incremental state updates
        const emitter = getClientEventEmitter();
        if (emitter) {
          const seq = (emitter as any).sequencer.nextSeq(lobby.id);
          const timestamp = Date.now();
          const payload = { playerId, avatar: avatarClass, seq, timestamp };
          (emitter as any).sequencer.bufferEvent(lobby.id, seq, 'session:avatar_selected', payload);
          io.to(lobby.id).emit('session:avatar_selected', payload);
        }
      } catch (error) {
        console.error('Error selecting avatar:', error);
        socket.emit('game_error', {
          message: error instanceof Error ? error.message : 'Failed to select avatar'
        });
      }
    });

    socket.on('assign_team', ({ playerId: targetPlayerId, team }) => {
      const playerId = socket.data.playerId;
      if (!playerId) return;

      // Track activity for host transfer selection
      sessionManager.recordPlayerActivity(playerId);

      try {
        // Get old team before change
        const oldLobby = sessionManager.getPlayerLobby(targetPlayerId);
        const oldPlayer = oldLobby?.players.find(p => p.id === targetPlayerId);
        const oldTeam = oldPlayer?.team;

        const lobby = sessionManager.assignTeam(playerId, targetPlayerId, team);

        // Notify EstimationManager of team change
        if (oldTeam && oldTeam !== team) {
          estimationManager.handleTeamChange(lobby.id, targetPlayerId, oldTeam, team);
        }

        // Removed lobby_updated: session:team_changed event emitted by sessionManager.assignTeam
      } catch (error) {
        if (error instanceof PlayerNotHostError) {
          socket.emit('game_error', { message: 'Only the host can assign teams' });
        } else if (error instanceof SessionError) {
          socket.emit('game_error', { message: error.message });
        } else {
          console.error('Unexpected error in assign_team:', error);
          socket.emit('game_error', { message: 'Failed to assign team' });
        }
      }
    });

    socket.on('change_own_team', ({ team }) => {
      const playerId = socket.data.playerId;
      if (!playerId) return;

      // Track activity for host transfer selection
      sessionManager.recordPlayerActivity(playerId);

      try {
        // Get old team before change
        const oldLobby = sessionManager.getPlayerLobby(playerId);
        const oldPlayer = oldLobby?.players.find(p => p.id === playerId);
        const oldTeam = oldPlayer?.team;

        const lobby = sessionManager.changeOwnTeam(playerId, team);

        // Notify EstimationManager of team change
        if (oldTeam && oldTeam !== team) {
          estimationManager.handleTeamChange(lobby.id, playerId, oldTeam, team);

          // If switching FROM spectator to voter during active battle
          if (oldTeam === 'spectators' && team !== 'spectators') {
            const combatState = combatManager.getCombatState(lobby.id);
            if (combatState && combatState.boss && combatState.boss.hp > 0) {
              // Kill their minion (no respawn)
              combatManager.handleSpectatorSwitchToVoter(lobby.id, playerId);

              // Add to estimation eligible voters
              estimationManager.addEligibleVoter(lobby.id, playerId, team);
              console.log(`Spectator ${playerId} switched to ${team}, minion killed`);
            }
          }

          // If switching TO spectator from voter during active battle
          if (oldTeam !== 'spectators' && team === 'spectators') {
            // Remove from estimation (they can't vote as spectator)
            estimationManager.removeEligibleVoter(lobby.id, playerId);
            console.log(`Voter ${playerId} switched to spectator, removed from estimation`);
          }
        }

        // Removed lobby_updated: session:team_changed event emitted by sessionManager.changeOwnTeam
      } catch (error) {
        if (error instanceof SessionError) {
          socket.emit('game_error', { message: error.message });
        } else {
          console.error('Unexpected error in change_own_team:', error);
          socket.emit('game_error', { message: 'Failed to change team' });
        }
      }
    });

    socket.on('add_tickets', ({ tickets }) => {
      const playerId = socket.data.playerId;
      if (!playerId) return;

      try {
        const lobby = sessionManager.addTickets(playerId, tickets);
        // Keep lobby_updated for ticket management (host-only, not covered by fine-grained events yet)
        io.to(lobby.id).emit('lobby_updated', { lobby });
        console.log(`Host ${playerId} added ${tickets.length} ticket(s) to lobby ${lobby.id}`);
      } catch (error) {
        console.error('Error adding tickets:', error);
        socket.emit('game_error', {
          message: error instanceof Error ? error.message : 'Failed to add tickets'
        });
      }
    });

    socket.on('remove_ticket', ({ ticketId }) => {
      const playerId = socket.data.playerId;
      if (!playerId) return;

      try {
        const lobby = sessionManager.removeTicket(playerId, ticketId);
        // Keep lobby_updated for ticket management (host-only, not covered by fine-grained events yet)
        io.to(lobby.id).emit('lobby_updated', { lobby });
        console.log(`Host ${playerId} removed ticket ${ticketId} from lobby ${lobby.id}`);
      } catch (error) {
        console.error('Error removing ticket:', error);
        socket.emit('game_error', {
          message: error instanceof Error ? error.message : 'Failed to remove ticket'
        });
      }
    });

    // Explicit leave lobby (user clicked back to menu)
    socket.on('leave_lobby', () => {
      const playerId = socket.data.playerId;
      const lobbyId = socket.data.lobbyId;
      if (!playerId || !lobbyId) return;

      console.log(`🚪 Player ${playerId} explicitly leaving lobby ${lobbyId}`);

      // Remove player from lobby
      const updatedLobby = sessionManager.removePlayer(playerId);

      // Leave socket room
      socket.leave(lobbyId);

      // Clear socket data
      socket.data.playerId = undefined;
      socket.data.lobbyId = undefined;

      // Notify remaining players
      if (updatedLobby) {
        io.to(lobbyId).emit('player_left', { playerId });
        io.to(lobbyId).emit('lobby_updated', { lobby: updatedLobby });
      }
    });

    // Update lobby name (host only)
    socket.on('update_lobby_name', ({ name }) => {
      console.log(`📝 update_lobby_name received with name: "${name}"`);

      const playerId = socket.data.playerId;
      if (!playerId) {
        console.log('❌ update_lobby_name: No playerId on socket');
        return;
      }

      const lobby = sessionManager.getPlayerLobby(playerId);
      if (!lobby) {
        console.log(`❌ update_lobby_name: No lobby found for player ${playerId}`);
        return;
      }

      const player = lobby.players.find(p => p.id === playerId);
      if (!player?.isHost) {
        console.log(`❌ update_lobby_name: Player ${playerId} is not host`);
        return;
      }

      const trimmedName = name?.trim();
      if (!trimmedName || trimmedName.length > 50) {
        console.log(`❌ update_lobby_name: Invalid name (empty or too long): "${trimmedName}"`);
        return;
      }

      lobby.name = trimmedName;
      io.to(lobby.id).emit('lobby_updated', { lobby });
      console.log(`✅ Host ${playerId} renamed lobby to "${trimmedName}"`);
    });

    // Lobby movement events for 2D sidescroller playground
    socket.on('lobby_player_pos', ({ x, y, direction }) => {
      const playerId = socket.data.playerId;
      const lobbyId = socket.data.lobbyId;
      if (!playerId || !lobbyId) return;

      // Validate that player is in lobby phase
      const lobby = sessionManager.getLobby(lobbyId);
      if (!lobby || lobby.gamePhase !== 'lobby') {
        console.log(`Player ${playerId} tried to move but lobby is not in lobby phase: ${lobby?.gamePhase || 'not found'}`);
        return;
      }

      // Broadcast position to other players in the same lobby
      socket.to(lobbyId).emit('lobby_player_pos', { 
        playerId, 
        x, 
        y, 
        direction 
      });
    });

    socket.on('lobby_player_jump', ({ isJumping }) => {
      const playerId = socket.data.playerId;
      const lobbyId = socket.data.lobbyId;
      if (!playerId || !lobbyId) return;

      // Validate that player is in lobby phase
      const lobby = sessionManager.getLobby(lobbyId);
      if (!lobby || lobby.gamePhase !== 'lobby') {
        console.log(`Player ${playerId} tried to jump but lobby is not in lobby phase: ${lobby?.gamePhase || 'not found'}`);
        return;
      }

      // Broadcast jump state to other players in the same lobby
      socket.to(lobbyId).emit('lobby_player_jump', { 
        playerId,
        isJumping 
      });
    });

    socket.on('player_charge', ({ isCharging, chargePower }: { isCharging: boolean; chargePower?: number }) => {
      const playerId = socket.data.playerId;
      const lobbyId = socket.data.lobbyId;
      
      if (!playerId || !lobbyId) return;

      const lobby = sessionManager.getLobby(lobbyId);
      if (!lobby || lobby.gamePhase !== 'lobby') {
        return;
      }

      // Broadcast charge state to other players in the same lobby
      socket.to(lobbyId).emit('lobby_player_charge', { 
        playerId,
        isCharging,
        chargePower: chargePower || 0
      });
    });

    socket.on('lobby_emote', ({ message, x, y }) => {
      const playerId = socket.data.playerId;
      const lobbyId = socket.data.lobbyId;
      if (!playerId || !lobbyId) return;

      // Validate that player is in lobby phase
      const lobby = sessionManager.getLobby(lobbyId);
      if (!lobby || lobby.gamePhase !== 'lobby') {
        console.log(`Player ${playerId} tried to emote but lobby is not in lobby phase: ${lobby?.gamePhase || 'not found'}`);
        return;
      }

      // Validate message length to prevent spam
      if (!message || message.length > 100) {
        console.log(`Player ${playerId} sent invalid emote message: ${message?.length || 0} characters`);
        return;
      }

      // Broadcast emote to other players in the same lobby
      socket.to(lobbyId).emit('lobby_emote', { 
        playerId,
        message: message.trim(),
        x, 
        y 
      });
      
      console.log(`Player ${playerId} emoted in lobby ${lobbyId}: "${message.trim()}"`);
    });

    // Handle battle emotes
    socket.on('battle_emote', ({ message, x, y }) => {
      const playerId = socket.data.playerId;
      const lobbyId = socket.data.lobbyId;
      if (!playerId || !lobbyId) return;

      // Validate that player is in battle phase
      const lobby = sessionManager.getLobby(lobbyId);
      if (!lobby || lobby.gamePhase !== 'battle') {
        console.log(`Player ${playerId} tried to battle emote but lobby is not in battle phase: ${lobby?.gamePhase || 'not found'}`);
        return;
      }

      // Validate message length to prevent spam
      if (!message || message.length > 100) {
        console.log(`Player ${playerId} sent invalid battle emote message: ${message?.length || 0} characters`);
        return;
      }

      // Broadcast battle emote to other players in the same lobby
      socket.to(lobbyId).emit('battle_emote', { 
        playerId,
        message: message.trim(),
        x, 
        y 
      });
      
      console.log(`Player ${playerId} battle emoted in lobby ${lobbyId}: "${message.trim()}"`);
    });

    socket.on('start_battle', () => {
      const playerId = socket.data.playerId;
      console.log(`🎮 start_battle received from socket ${socket.id}, playerId: ${playerId}`);

      if (!playerId) {
        console.log('❌ No playerId found in socket data');
        return;
      }

      // Use sessionManager to get the lobby (not gameState which has stale mappings)
      const lobby = sessionManager.getPlayerLobby(playerId);
      if (!lobby) {
        console.log(`❌ No lobby found for player ${playerId} via sessionManager`);
        return;
      }

      // Check if player is host
      const player = lobby.players.find(p => p.id === playerId);
      if (!player?.isHost) {
        console.log(`❌ Player ${playerId} is not host, cannot start battle`);
        socket.emit('game_error', { message: 'Only the host can start the battle' });
        return;
      }

      // Check if there are tickets
      if (!lobby.tickets || lobby.tickets.length === 0) {
        console.log(`❌ No tickets in lobby ${lobby.id}`);
        socket.emit('game_error', { message: 'Add at least one ticket before starting' });
        return;
      }

      // Check if there's at least one non-spectator player
      const activeVoters = lobby.players.filter(p => p.team !== 'spectators');
      if (activeVoters.length === 0) {
        console.log(`❌ No active voters in lobby ${lobby.id}`);
        socket.emit('game_error', { message: 'At least one player must be on a voting team' });
        return;
      }

      console.log(`🎮 Starting battle for lobby ${lobby.id} with ${lobby.tickets.length} tickets`);
      const result = gameState.startBattle(playerId, lobby.tickets);
      if (result) {
        if ('error' in result) {
          // Send error message to the client
          console.log(`❌ Battle start error: ${result.error}`);
          socket.emit('game_error', { message: result.error });
        } else {
          const { lobby: updatedLobby, boss } = result;

          console.log(`✅ Battle started successfully for lobby ${updatedLobby.id}`);

          // Initialize CombatManager state for domain-based combat operations
          const players = updatedLobby.players.map(p => ({ id: p.id, team: p.team }));
          combatManager.initializeCombat(updatedLobby.id, players, 0);
          console.log(`✅ CombatManager initialized for lobby ${updatedLobby.id}`);

          // Initialize EstimationManager for voting/XP events
          estimationManager.startEstimation(updatedLobby.id, updatedLobby.currentTicket!.id);
          for (const p of updatedLobby.players) {
            if (p.team !== 'spectators') {
              estimationManager.addEligibleVoter(updatedLobby.id, p.id, p.team);
            }
          }
          console.log(`✅ EstimationManager initialized for lobby ${updatedLobby.id}`);

          // Start the battle (synchronous - relies on socket.io event ordering)
          io.to(updatedLobby.id).emit('battle_started', { lobby: updatedLobby, boss });
        }
      } else {
        console.log(`❌ startBattle returned null/undefined`);
      }
    });

    socket.on('submit_score', ({ score }) => {
      try {
        const playerId = socket.data.playerId;
        if (!playerId) return;

        // Track activity for host transfer selection
        sessionManager.recordPlayerActivity(playerId);

        const lobby = gameState.submitScore(playerId, score);
        if (lobby) {
          const player = lobby.players.find(p => p.id === playerId);
          if (player) {
            socket.to(lobby.id).emit('score_submitted', { playerId, team: player.team });
          }

          // Removed lobby_updated: estimation:vote_cast event emitted by estimationManager
          
          // Check if all scores submitted and reveal
          if (lobby.gamePhase === 'reveal') {
            const result = gameState.revealScores(lobby.id);
            if (result) {
              const { lobby: updatedLobby, teamScores, teamConsensus } = result;
              io.to(lobby.id).emit('scores_revealed', { teamScores, teamConsensus });
              // Keep lobby_updated for phase transitions (not yet covered by fine-grained events)
              io.to(lobby.id).emit('lobby_updated', { lobby: updatedLobby });
              
              // Check if teams agreed using EstimationManager
              const teamsAgree = estimationManager.checkTeamsAgree(updatedLobby.id, updatedLobby.teams.developers.length, updatedLobby.teams.qa.length);
              
              if (teamsAgree && updatedLobby.boss?.defeated) {
                io.to(lobby.id).emit('boss_defeated', { lobby: updatedLobby });
              }
            }
          }
        }
      } catch (error) {
        console.error('Error in submit_score handler:', error);
        socket.emit('game_error', {
          message: error instanceof Error ? error.message : 'Failed to submit score'
        });
      }
    });

    socket.on('update_discussion_vote', ({ score }) => {
      try {
        const playerId = socket.data.playerId;
        if (!playerId) return;

        const lobby = gameState.updateDiscussionVote(playerId, score);
        if (lobby) {
          // Keep lobby_updated for discussion phase updates (not yet covered by fine-grained events)
          io.to(lobby.id).emit('lobby_updated', { lobby });
          
          // Check for consensus and auto-advance - rely on gameState for consensus logic
          const result = gameState.checkDiscussionConsensus(lobby.id);
          if (result) {
            const { lobby: updatedLobby } = result;
            
            // If lobby progressed beyond discussion phase, emit appropriate updates
            if (updatedLobby.gamePhase !== 'discussion') {
              // Auto-advance after a brief delay for players to see the consensus
              setTimeout(() => {
                // Keep lobby_updated for phase transitions (not yet covered by fine-grained events)
                io.to(lobby.id).emit('lobby_updated', { lobby: updatedLobby });
                if (updatedLobby.boss?.defeated) {
                  io.to(lobby.id).emit('boss_defeated', { lobby: updatedLobby });
                }
              }, 2000);
            }
          }
        }
      } catch (error) {
        console.error('Error in update_discussion_vote handler:', error);
        socket.emit('game_error', {
          message: error instanceof Error ? error.message : 'Failed to update discussion vote'
        });
      }
    });

    // REMOVED: Old attack_boss handler replaced by domain-based handler below (line ~1734)
    
    // Boss damage to player
    socket.on('boss_damage_player', ({ playerId, damage }: { playerId: string; damage: number }) => {
      try {
        const attackerId = socket.data.playerId;
        if (!attackerId) return;

        const result = gameState.bossDamagePlayer(playerId, damage);
        if (result) {
          const { lobby, targetHealth, gameOver } = result;
          
          // Broadcast boss damage to room
          io.to(lobby.id).emit('player_attacked', { 
            attackerId: 'boss', 
            targetId: playerId, 
            damage, 
            targetHealth 
          });
          
          // Check for game over
          if (gameOver) {
            io.to(lobby.id).emit('game_over', { lobby });
          }

          // Removed lobby_updated: combat:player_damaged event emitted by combatManager
        }
      } catch (error) {
        console.error('Error in boss_damage_player handler:', error);
        socket.emit('game_error', {
          message: error instanceof Error ? error.message : 'Failed to process boss damage'
        });
      }
    });

    // Player projectile broadcasting for multiplayer visibility
    socket.on('player_projectile', ({ startX, startY, targetX, targetY, emoji, targetPlayerId }) => {
      const playerId = socket.data.playerId;
      if (!playerId) return;

      const lobby = sessionManager.getPlayerLobby(playerId);
      if (!lobby || lobby.gamePhase !== 'battle') return;

      const player = lobby.players.find(p => p.id === playerId);
      if (!player) return;

      // Client should send percentage coordinates, so just relay them
      // This removes the hardcoded screen dimension assumptions
      socket.to(lobby.id).emit('player_projectile_fired', {
        playerId,
        playerName: player.name,
        startX,
        startY,
        targetX,
        targetY,
        emoji,
        targetPlayerId,
        projectileId: Math.random().toString(36).substring(2, 15)
      });

      console.log(`🚀 Broadcasting projectile from ${player.name}: ${emoji} to ${targetPlayerId ? 'player' : 'boss'}`);
    });

    socket.on('proceed_next_level', () => {
      try {
        const playerId = socket.data.playerId;
        const lobbyId = socket.data.lobbyId;
        if (!playerId || !lobbyId) return;

        const lobby = sessionManager.getLobby(lobbyId);
        if (!lobby || lobby.hostId !== playerId) {
          socket.emit('game_error', { message: 'Only host can proceed to next level' });
          return;
        }

        if (lobby.gamePhase !== 'next_level') {
          socket.emit('game_error', { message: 'Can only proceed from next_level phase' });
          return;
        }

        // Get next ticket
        const currentIndex = lobby.tickets?.findIndex(t => t.id === lobby.currentTicket?.id) ?? -1;
        const nextTicket = lobby.tickets?.[currentIndex + 1];
        if (!nextTicket) {
          socket.emit('game_error', { message: 'No more tickets' });
          return;
        }

        // Reset game state for next round
        lobby.currentTicket = nextTicket;
        
        // Transition to battle phase via PhaseCoordinator
        phaseCoordinator.transitionTo(lobby, 'battle', {
          reason: 'proceed_next_level_handler',
          initiator: playerId
        });

        // Reset estimation state
        estimationManager.cleanupLobby(lobbyId);
        estimationManager.startEstimation(lobbyId, nextTicket.id);

        // Initialize players as eligible voters
        for (const player of lobby.players) {
          if (player.team !== 'spectators') {
            estimationManager.addEligibleVoter(lobbyId, player.id, player.team);
          }
        }

        // Reset combat state
        combatManager.cleanupLobby(lobbyId);
        const players = lobby.players.map(p => ({ id: p.id, team: p.team }));
        const ticketIndex = (lobby.completedTickets?.length ?? 0);
        combatManager.initializeCombat(lobbyId, players, ticketIndex);

        // Reset player scores
        for (const player of lobby.players) {
          player.hasSubmittedScore = false;
          player.currentScore = undefined;
        }

        eventBus.emit('session:phase_changed', {
          lobbyId,
          oldPhase: 'next_level',
          newPhase: 'battle',
        });

        // Keep lobby_updated: major state reset (new ticket, reset combat/estimation)
        io.to(lobbyId).emit('lobby_updated', { lobby });
        console.log(`Proceed to next level in lobby ${lobbyId}: ticket ${nextTicket.id}`);
      } catch (error) {
        socket.emit('game_error', { message: (error as Error).message });
      }
    });

    socket.on('abandon_quest', () => {
      const playerId = socket.data.playerId;
      if (!playerId) return;

      const lobby = gameState.abandonQuest(playerId);
      if (lobby) {
        io.to(lobby.id).emit('quest_abandoned', { lobby });
        // Keep lobby_updated for phase transitions (not yet covered by fine-grained events)
        io.to(lobby.id).emit('lobby_updated', { lobby });
      }
    });

    socket.on('return_to_lobby', () => {
      console.log('🏠 Server received return_to_lobby event');
      const playerId = socket.data.playerId;
      if (!playerId) {
        console.log('❌ No playerId found for return_to_lobby');
        return;
      }

      console.log(`🏠 Processing return_to_lobby for player: ${playerId}`);
      const lobby = gameState.returnToLobby(playerId);
      if (lobby) {
        console.log(`✅ Returned to lobby: ${lobby.id}, new phase: ${lobby.gamePhase}`);
        // Keep lobby_updated for phase transitions (not yet covered by fine-grained events)
        io.to(lobby.id).emit('lobby_updated', { lobby });
      } else {
        console.log('❌ Failed to return to lobby - gameState.returnToLobby returned null');
      }
    });

    socket.on('force_reveal', () => {
      const playerId = socket.data.playerId;
      if (!playerId) return;

      const result = gameState.forceRevealScores(playerId);
      if (result) {
        const { lobby: updatedLobby, teamScores, teamConsensus } = result;
        io.to(updatedLobby.id).emit('scores_revealed', { teamScores, teamConsensus });
        // Keep lobby_updated for phase transitions (not yet covered by fine-grained events)
        io.to(updatedLobby.id).emit('lobby_updated', { lobby: updatedLobby });
        
        // Check if teams agreed using EstimationManager
        const teamsAgree = estimationManager.checkTeamsAgree(updatedLobby.id, updatedLobby.teams.developers.length, updatedLobby.teams.qa.length);
        
        if (teamsAgree && updatedLobby.boss?.defeated) {
          io.to(updatedLobby.id).emit('boss_defeated', { lobby: updatedLobby });
        }
      }
    });

    socket.on('youtube_play', ({ videoId, url }) => {
      const playerId = socket.data.playerId;
      const lobbyId = socket.data.lobbyId;
      
      if (!playerId || !lobbyId) return;

      // Only allow host to control YouTube music
      const lobby = sessionManager.getLobby(lobbyId);
      if (!lobby || lobby.hostId !== playerId) {
        socket.emit('game_error', { message: 'Only the host can control YouTube music' });
        return;
      }

      // Broadcast to all players in the lobby
      io.to(lobbyId).emit('youtube_play_synced', { videoId, url });
      console.log(`Host ${playerId} started YouTube music: ${url}`);
    });

    socket.on('youtube_stop', () => {
      const playerId = socket.data.playerId;
      const lobbyId = socket.data.lobbyId;
      
      if (!playerId || !lobbyId) return;

      // Only allow host to control YouTube music
      const lobby = sessionManager.getLobby(lobbyId);
      if (!lobby || lobby.hostId !== playerId) {
        socket.emit('game_error', { message: 'Only the host can control YouTube music' });
        return;
      }

      // Broadcast to all players in the lobby
      io.to(lobbyId).emit('youtube_stop_synced');
      console.log(`Host ${playerId} stopped YouTube music`);
    });

    socket.on('advancePhaseNow', () => {
      try {
        // Get authenticated session data (prevents client spoofing)
        const playerId = socket.data.playerId;
        const lobbyId = socket.data.lobbyId;
        
        if (!playerId || !lobbyId) {
          socket.emit('game_error', { message: 'Not authenticated or not in a lobby' });
          return;
        }

        // Only allow host to manually advance phases
        const lobby = sessionManager.getLobby(lobbyId);
        if (!lobby || lobby.hostId !== playerId) {
          socket.emit('game_error', { message: 'Only the host can manually advance phases' });
          return;
        }

        // Only allow advancement during discussion phase with consensus
        if (lobby.gamePhase !== 'discussion') {
          socket.emit('game_error', { message: 'Phase advancement only available during discussion phase' });
          return;
        }

        const result = gameState.manualAdvancePhase(lobbyId);
        if (result) {
          const { lobby: updatedLobby } = result;

          // Keep lobby_updated for phase transitions (not yet covered by fine-grained events)
          io.to(lobbyId).emit('lobby_updated', { lobby: updatedLobby });

          console.log(`Host ${playerId} manually advanced phase in lobby ${lobbyId}`);
        } else {
          socket.emit('game_error', { message: 'Cannot advance phase - consensus not reached' });
        }
      } catch (error) {
        console.error('Error in advancePhaseNow:', error);
        socket.emit('game_error', { message: 'Failed to advance phase' });
      }
    });

    socket.on('forceVotingProgression', ({ lobbyId }) => {
      try {
        const playerId = socket.data.playerId;
        if (!playerId) {
          socket.emit('game_error', { message: 'Player not authenticated' });
          return;
        }

        const result = gameState.forceVotingProgression(playerId);
        if (result) {
          const { lobby, message } = result;

          // Keep lobby_updated for phase transitions (not yet covered by fine-grained events)
          io.to(lobbyId).emit('lobby_updated', { lobby });

          // Notify everyone about the forced progression
          io.to(lobbyId).emit('game_error', { message });

          console.log(`${message} in lobby ${lobbyId}`);

          // If phase changed to reveal, trigger reveal logic
          if (lobby.gamePhase === 'reveal') {
            const revealResult = gameState.revealScores(lobby.id);
            if (revealResult) {
              const { lobby: updatedLobby, teamScores, teamConsensus } = revealResult;
              io.to(lobby.id).emit('scores_revealed', { teamScores, teamConsensus });
              // Keep lobby_updated for phase transitions (not yet covered by fine-grained events)
              io.to(lobby.id).emit('lobby_updated', { lobby: updatedLobby });
            }
          }
        } else {
          socket.emit('game_error', { message: 'Cannot force voting progression - insufficient permissions or invalid state' });
        }
      } catch (error) {
        console.error('Error in forceVotingProgression:', error);
        socket.emit('game_error', { message: 'Failed to force voting progression' });
      }
    });

    // Position sync for combat
    socket.on('player_pos', ({ x, y }: { x: number; y: number }) => {
      const playerId = socket.data.playerId;
      if (!playerId) return;

      try {
        const lobby = sessionManager.updatePlayerPosition(playerId, { x, y });
        // Broadcast position updates to room (throttled)
        socket.to(lobby.id).emit('players_pos', { positions: lobby.playerPositions });
      } catch (error) {
        console.error('Error updating player position:', error);
      }
    });

    // Player vs player combat
    socket.on('attack_player', ({ targetId, damage }: { targetId: string; damage: number }) => {
      try {
        const playerId = socket.data.playerId;
        if (!playerId) return;

        // For spectators, override target with nearest player
        const lobby = sessionManager.getPlayerLobby(playerId);
        if (!lobby) return;

        const attacker = lobby.players.find(p => p.id === playerId);
        if (!attacker || attacker.team !== 'spectators') return;

        const actualTargetId = combatManager.findNearestTarget(lobby.id, playerId) || targetId;
        const result = gameState.attackPlayer(playerId, actualTargetId, damage);
        
        if (result) {
          const { lobby: updatedLobby, targetHealth, gameOver, modifier } = result;
          io.to(lobby.id).emit('player_attacked', { 
            attackerId: playerId, 
            targetId: actualTargetId, 
            damage, 
            targetHealth 
          });
          
          // Emit modifier update
          if (modifier !== undefined) {
            io.to(lobby.id).emit('modifier_updated', { modifier });
          }
          
          // Check for game over
          if (gameOver) {
            io.to(lobby.id).emit('game_over', { lobby: updatedLobby });
          }

          // Removed lobby_updated: combat:player_damaged event emitted by combatManager
        }
      } catch (error) {
        console.error('Error in attack_player handler:', error);
        socket.emit('game_error', {
          message: error instanceof Error ? error.message : 'Failed to attack player'
        });
      }
    });

    // Party healing (priest special ability)
    socket.on('heal_party', () => {
      try {
        const playerId = socket.data.playerId;
        if (!playerId) return;

        const lobby = sessionManager.getPlayerLobby(playerId);
        if (!lobby) return;

        const healedPlayers = combatManager.healParty(lobby.id, playerId);
        io.to(lobby.id).emit('party_healed', { healerId: playerId, healedPlayers });
        console.log(`💫 Priest ${playerId} healed ${healedPlayers.length} party members`);
      } catch (error) {
        console.error('Error in heal_party handler:', error);
        socket.emit('game_error', {
          message: error instanceof Error ? error.message : 'Failed to heal party'
        });
      }
    });

    // Revival system
    socket.on('revive_start', ({ targetId }: { targetId: string }) => {
      try {
        const playerId = socket.data.playerId;
        if (!playerId) return;

        const lobby = sessionManager.getPlayerLobby(playerId);
        if (!lobby) return;

        const success = combatManager.startRevival(lobby.id, playerId, targetId);
        if (success) {
          io.to(lobby.id).emit('revive_progress', { targetId, reviverId: playerId, progress: 0 });
        }
      } catch (error) {
        console.error('Error in revive_start handler:', error);
        socket.emit('game_error', {
          message: error instanceof Error ? error.message : 'Failed to start revival'
        });
      }
    });

    socket.on('revive_cancel', ({ targetId }: { targetId: string }) => {
      try {
        const playerId = socket.data.playerId;
        if (!playerId) return;

        const lobby = sessionManager.getPlayerLobby(playerId);
        if (!lobby) return;

        combatManager.cancelRevival(playerId, 'player_cancelled');
        io.to(lobby.id).emit('revive_cancelled', { targetId, reviverId: playerId });
      } catch (error) {
        console.error('Error in revive_cancel handler:', error);
        socket.emit('game_error', {
          message: error instanceof Error ? error.message : 'Failed to cancel revival'
        });
      }
    });

    socket.on('revive_tick', ({ targetId }: { targetId: string }) => {
      // Note: CombatManager handles automatic ticking internally
      // This client-side tick is now a no-op for backwards compatibility
      // The CombatManager will auto-cancel if conditions aren't met
      try {
        const playerId = socket.data.playerId;
        if (!playerId) return;

        // No action needed - CombatManager handles validation automatically
        // Client can continue sending ticks for heartbeat if needed
      } catch (error) {
        console.error('Error in revive_tick handler:', error);
      }
    });

    // Jumping state sync
    socket.on('player_jump', ({ isJumping }: { isJumping: boolean }) => {
      const playerId = socket.data.playerId;
      if (!playerId) return;

      try {
        sessionManager.setPlayerJumping(playerId, isJumping);
        // Jumping state is transient, not critical for sync - no broadcast needed
      } catch (error) {
        console.error('Error updating player jumping state:', error);
      }
    });

    // Timer settings update
    socket.on('update_timer_settings', ({ timerSettings }) => {
      try {
        const playerId = socket.data.playerId;
        if (!playerId) return;

        const lobby = sessionManager.updateTimerSettings(playerId, timerSettings);
        // Keep lobby_updated for settings changes (not yet covered by fine-grained events)
        io.to(lobby.id).emit('lobby_updated', { lobby });
      } catch (error) {
        console.error('Error in update_timer_settings handler:', error);
        socket.emit('game_error', {
          message: error instanceof Error ? error.message : 'Failed to update timer settings'
        });
      }
    });

    socket.on('update_jira_settings', ({ jiraSettings }) => {
      try {
        const playerId = socket.data.playerId;
        if (!playerId) return;

        const lobby = sessionManager.updateJiraSettings(playerId, jiraSettings);
        // Keep lobby_updated for settings changes (not yet covered by fine-grained events)
        io.to(lobby.id).emit('lobby_updated', { lobby });
      } catch (error) {
        console.error('Error in update_jira_settings handler:', error);
        socket.emit('game_error', {
          message: error instanceof Error ? error.message : 'Failed to update Jira settings'
        });
      }
    });

    socket.on('update_estimation_settings', ({ estimationSettings }) => {
      try {
        const playerId = socket.data.playerId;
        if (!playerId) return;

        const lobby = sessionManager.updateEstimationSettings(playerId, estimationSettings);
        // Keep lobby_updated for settings changes (not yet covered by fine-grained events)
        io.to(lobby.id).emit('lobby_updated', { lobby });
        console.log(`Estimation settings updated by ${playerId} in lobby ${lobby.id}`);
      } catch (error) {
        console.error('Error in update_estimation_settings handler:', error);
        socket.emit('game_error', {
          message: error instanceof Error ? error.message : 'Failed to update estimation settings'
        });
      }
    });

    // Reconnection handler
    socket.on('reconnect_with_token', ({ reconnectToken }) => {
      try {
        const response = sessionManager.attemptPlayerReconnect(reconnectToken);

        if (response.result === 'success' && response.lobbySync) {
          const { lobbySync } = response;
          const playerId = lobbySync.yourPlayer.id;
          const lobbyId = lobbySync.lobby.id;

          // Sync player-lobby mapping to gameState for battle functions
          gameState.syncPlayerToLobby(playerId, lobbySync.lobby);

          // Update socket data
          socket.data.playerId = playerId;
          socket.data.lobbyId = lobbyId;

          // Join socket room
          socket.join(lobbyId);

          // Send successful reconnection response
          socket.emit('lobby_sync', lobbySync);
          socket.emit('reconnect_response', response);

          // Reinitialize fine-grained event sequence for reconnected player
          const emitter = getClientEventEmitter();
          emitter.sendFullState(lobbyId, lobbySync.lobby, socket.id);

          // Notify other players about the reconnection
          socket.to(lobbyId).emit('player_reconnected', {
            playerId,
            playerName: lobbySync.yourPlayer.name
          });
          // Keep lobby_updated for reconnection notifications (not yet covered by fine-grained events)
          socket.to(lobbyId).emit('lobby_updated', { lobby: lobbySync.lobby });

          console.log(`✅ Player ${lobbySync.yourPlayer.name} (${playerId}) reconnected successfully`);
        } else {
          // Send failed reconnection response
          socket.emit('reconnect_response', response);
          console.log(`❌ Reconnection failed: ${response.message}`);
        }
      } catch (error) {
        console.error('Error handling reconnect:', error);
        socket.emit('reconnect_response', {
          result: 'server_error',
          message: 'Server error during reconnection'
        });
      }
    });

    // Client heartbeat to prevent infrastructure timeouts (Cloudflare/Replit ~2min idle limit)
    socket.on('client_heartbeat' as any, () => {
      // Simply acknowledge - the act of receiving this message resets infrastructure idle timers
      const playerId = socket.data.playerId;
      if (playerId) {
        console.log(`💓 Heartbeat received from ${playerId}`);
      }
    });

    // Handle missed events request (sequence gap recovery)
    socket.on('request_missed_events', ({ lastSeq }) => {
      const lobbyId = socket.data.lobbyId;
      if (!lobbyId) {
        console.warn('request_missed_events: No lobbyId in socket data');
        return;
      }

      const emitter = getClientEventEmitter();
      const missedEvents = emitter.getMissedEvents(lobbyId, lastSeq);

      if (missedEvents === null) {
        // Gap too large, send full state refresh
        console.log(`Gap too large for ${lobbyId}, sending full state`);
        const lobby = sessionManager.getLobby(lobbyId);
        if (lobby) {
          emitter.sendFullState(lobbyId, lobby, socket.id);
        }
      } else if (missedEvents.length > 0) {
        // Send missed events
        console.log(`Sending ${missedEvents.length} missed events to ${socket.id}`);
        socket.emit('system:missed_events', { events: missedEvents });
      }
      // If missedEvents is empty array, client is caught up - no action needed
    });

    // ============================================================================
    // ESTIMATION DOMAIN HANDLERS (using EstimationManager)
    // ============================================================================

    // Start estimation for a ticket
    socket.on('start_estimation' as any, ({ ticketId }: { ticketId: string }) => {
      try {
        const playerId = socket.data.playerId;
        const lobbyId = socket.data.lobbyId;

        if (!playerId || !lobbyId) {
          socket.emit('game_error', { message: 'Not in a lobby' });
          return;
        }

        // Verify player is host
        const lobby = sessionManager.getLobby(lobbyId);
        if (!lobby) throw new LobbyNotFoundError(lobbyId);
        if (lobby.hostId !== playerId) throw new PlayerNotHostError(playerId);

        // Start estimation
        estimationManager.startEstimation(lobbyId, ticketId);

        // Add all current non-spectator players as eligible voters
        for (const player of lobby.players) {
          if (player.team !== 'spectators') {
            estimationManager.addEligibleVoter(lobbyId, player.id, player.team);
          }
        }

        // Broadcast estimation started
        io.to(lobbyId).emit('estimation_started' as any, { ticketId });
        console.log(`Estimation started for ticket ${ticketId} in lobby ${lobbyId}`);
      } catch (error) {
        if (error instanceof PlayerNotHostError) {
          socket.emit('game_error', { message: 'Only the host can start estimation' });
        } else if (error instanceof LobbyNotFoundError) {
          socket.emit('game_error', { message: 'Lobby not found' });
        } else {
          console.error('Start estimation error:', error);
          socket.emit('game_error', { message: 'Failed to start estimation' });
        }
      }
    });

    // Cast vote during estimation
    socket.on('cast_vote' as any, ({ vote }: { vote: number | '?' }) => {
      try {
        const playerId = socket.data.playerId;
        const lobbyId = socket.data.lobbyId;

        if (!playerId || !lobbyId) {
          socket.emit('game_error', { message: 'Not in a lobby' });
          return;
        }

        // Get player's team from session
        const lobby = sessionManager.getLobby(lobbyId);
        if (!lobby) throw new LobbyNotFoundError(lobbyId);

        const player = lobby.players.find(p => p.id === playerId);
        if (!player) throw new PlayerNotFoundError(playerId);

        // Cast vote through EstimationManager
        estimationManager.castVote(lobbyId, playerId, player.team, vote);

        // Record activity for host transfer
        sessionManager.recordPlayerActivity(playerId);

        // Broadcast updated vote state
        const visibility = estimationManager.getAllVoteVisibility(lobbyId);
        io.to(lobbyId).emit('vote_state_updated' as any, visibility);

        console.log(`Player ${playerId} voted ${vote} on team ${player.team}`);
      } catch (error) {
        if (error instanceof EstimationNotActiveError) {
          socket.emit('game_error', { message: 'No active estimation' });
        } else if (error instanceof VoteNotEligibleError) {
          socket.emit('game_error', { message: error.message });
        } else if (error instanceof InvalidVoteValueError) {
          socket.emit('game_error', { message: error.message });
        } else if (error instanceof LobbyNotFoundError) {
          socket.emit('game_error', { message: 'Lobby not found' });
        } else {
          console.error('Vote error:', error);
          socket.emit('game_error', { message: 'Failed to submit vote' });
        }
      }
    });

    // Change vote during discussion phase
    socket.on('change_vote' as any, ({ newVote }: { newVote: number | '?' }) => {
      try {
        const playerId = socket.data.playerId;
        const lobbyId = socket.data.lobbyId;

        if (!playerId || !lobbyId) {
          socket.emit('game_error', { message: 'Not in a lobby' });
          return;
        }

        // Get player's team
        const lobby = sessionManager.getLobby(lobbyId);
        if (!lobby) throw new LobbyNotFoundError(lobbyId);

        const player = lobby.players.find(p => p.id === playerId);
        if (!player) throw new PlayerNotFoundError(playerId);

        // Change vote through EstimationManager
        estimationManager.changeVoteDuringDiscussion(lobbyId, playerId, player.team, newVote);

        // Record activity
        sessionManager.recordPlayerActivity(playerId);

        // Broadcast updated vote state
        const visibility = estimationManager.getAllVoteVisibility(lobbyId);
        io.to(lobbyId).emit('vote_state_updated' as any, visibility);

        console.log(`Player ${playerId} changed vote to ${newVote} during discussion`);
      } catch (error) {
        if (error instanceof NotInDiscussionPhaseError) {
          socket.emit('game_error', { message: 'Can only change vote during discussion phase' });
        } else if (error instanceof EstimationNotActiveError) {
          socket.emit('game_error', { message: 'No active estimation' });
        } else if (error instanceof VoteNotEligibleError) {
          socket.emit('game_error', { message: error.message });
        } else if (error instanceof InvalidVoteValueError) {
          socket.emit('game_error', { message: error.message });
        } else {
          console.error('Change vote error:', error);
          socket.emit('game_error', { message: 'Failed to change vote' });
        }
      }
    });

    // Pause voting timer (host control)
    socket.on('pause_voting_timer' as any, ({ team }: { team: TeamType }) => {
      try {
        const playerId = socket.data.playerId;
        const lobbyId = socket.data.lobbyId;

        if (!playerId || !lobbyId) {
          socket.emit('game_error', { message: 'Not in a lobby' });
          return;
        }

        // Verify player is host
        const lobby = sessionManager.getLobby(lobbyId);
        if (!lobby) throw new LobbyNotFoundError(lobbyId);
        if (lobby.hostId !== playerId) throw new PlayerNotHostError(playerId);

        estimationManager.pauseTimer(lobbyId, team, playerId);

        // Broadcast timer state
        io.to(lobbyId).emit('timer_paused' as any, { team });
        console.log(`Host paused voting timer for team ${team}`);
      } catch (error) {
        if (error instanceof PlayerNotHostError) {
          socket.emit('game_error', { message: 'Only the host can pause the timer' });
        } else {
          console.error('Pause timer error:', error);
          socket.emit('game_error', { message: 'Failed to pause timer' });
        }
      }
    });

    // Resume voting timer (host control)
    socket.on('resume_voting_timer' as any, ({ team }: { team: TeamType }) => {
      try {
        const playerId = socket.data.playerId;
        const lobbyId = socket.data.lobbyId;

        if (!playerId || !lobbyId) {
          socket.emit('game_error', { message: 'Not in a lobby' });
          return;
        }

        // Verify player is host
        const lobby = sessionManager.getLobby(lobbyId);
        if (!lobby) throw new LobbyNotFoundError(lobbyId);
        if (lobby.hostId !== playerId) throw new PlayerNotHostError(playerId);

        estimationManager.resumeTimer(lobbyId, team, playerId);

        // Broadcast timer state
        io.to(lobbyId).emit('timer_resumed' as any, { team });
        console.log(`Host resumed voting timer for team ${team}`);
      } catch (error) {
        if (error instanceof PlayerNotHostError) {
          socket.emit('game_error', { message: 'Only the host can resume the timer' });
        } else {
          console.error('Resume timer error:', error);
          socket.emit('game_error', { message: 'Failed to resume timer' });
        }
      }
    });

    // Extend voting timer (host control)
    socket.on('extend_voting_timer' as any, ({ team, additionalSeconds }: { team: TeamType; additionalSeconds: number }) => {
      try {
        const playerId = socket.data.playerId;
        const lobbyId = socket.data.lobbyId;

        if (!playerId || !lobbyId) {
          socket.emit('game_error', { message: 'Not in a lobby' });
          return;
        }

        // Verify player is host
        const lobby = sessionManager.getLobby(lobbyId);
        if (!lobby) throw new LobbyNotFoundError(lobbyId);
        if (lobby.hostId !== playerId) throw new PlayerNotHostError(playerId);

        const additionalMs = additionalSeconds * 1000;
        estimationManager.extendTimer(lobbyId, team, additionalMs, playerId);

        // Broadcast timer state
        io.to(lobbyId).emit('timer_extended' as any, { team, additionalSeconds });
        console.log(`Host extended voting timer for team ${team} by ${additionalSeconds}s`);
      } catch (error) {
        if (error instanceof PlayerNotHostError) {
          socket.emit('game_error', { message: 'Only the host can extend the timer' });
        } else {
          console.error('Extend timer error:', error);
          socket.emit('game_error', { message: 'Failed to extend timer' });
        }
      }
    });

    // Force estimate (host control during ties)
    socket.on('force_estimate' as any, ({ team, forcedValue }: { team: TeamType; forcedValue?: number }) => {
      try {
        const playerId = socket.data.playerId;
        const lobbyId = socket.data.lobbyId;

        if (!playerId || !lobbyId) {
          socket.emit('game_error', { message: 'Not in a lobby' });
          return;
        }

        // Verify player is host
        const lobby = sessionManager.getLobby(lobbyId);
        if (!lobby) throw new LobbyNotFoundError(lobbyId);
        if (lobby.hostId !== playerId) throw new PlayerNotHostError(playerId);

        const result = estimationManager.forceEstimate(lobbyId, team, playerId, forcedValue);

        // Broadcast forced estimate
        io.to(lobbyId).emit('estimate_forced' as any, { team, consensusValue: result.consensusValue });
        console.log(`Host forced estimate for team ${team}: ${result.consensusValue}`);
      } catch (error) {
        if (error instanceof PlayerNotHostError) {
          socket.emit('game_error', { message: 'Only the host can force an estimate' });
        } else if (error instanceof ForceEstimateTieError) {
          const err = error as ForceEstimateTieError;
          socket.emit('game_error', {
            message: `Vote is tied between [${err.tiedValues.join(', ')}]. Please choose one.`,
            tiedValues: err.tiedValues
          });
        } else if (error instanceof InvalidForcedValueError) {
          const err = error as InvalidForcedValueError;
          socket.emit('game_error', {
            message: `Invalid forced value. Must choose from: [${err.validValues.join(', ')}]`
          });
        } else if (error instanceof EstimationNotActiveError) {
          socket.emit('game_error', { message: 'No active estimation' });
        } else {
          console.error('Force estimate error:', error);
          socket.emit('game_error', { message: 'Failed to force estimate' });
        }
      }
    });

    // Enter discussion phase for a team
    socket.on('enter_discussion' as any, ({ team }: { team: TeamType }) => {
      try {
        const playerId = socket.data.playerId;
        const lobbyId = socket.data.lobbyId;

        if (!playerId || !lobbyId) {
          socket.emit('game_error', { message: 'Not in a lobby' });
          return;
        }

        // Verify player is host
        const lobby = sessionManager.getLobby(lobbyId);
        if (!lobby) throw new LobbyNotFoundError(lobbyId);
        if (lobby.hostId !== playerId) throw new PlayerNotHostError(playerId);

        estimationManager.enterDiscussionPhase(lobbyId, team);

        // Broadcast phase change
        const visibility = estimationManager.getAllVoteVisibility(lobbyId);
        io.to(lobbyId).emit('vote_state_updated' as any, visibility);
        console.log(`Team ${team} entered discussion phase`);
      } catch (error) {
        if (error instanceof PlayerNotHostError) {
          socket.emit('game_error', { message: 'Only the host can start discussion' });
        } else if (error instanceof EstimationNotActiveError) {
          socket.emit('game_error', { message: 'No active estimation' });
        } else {
          console.error('Enter discussion error:', error);
          socket.emit('game_error', { message: 'Failed to enter discussion phase' });
        }
      }
    });

    // Finalize estimate (host only during discussion)
    socket.on('finalize_estimate', (data: { estimate: number }) => {
      try {
        const playerId = socket.data.playerId;
        const lobbyId = socket.data.lobbyId;

        if (!playerId || !lobbyId) {
          socket.emit('game_error', { message: 'Not in a lobby' });
          return;
        }

        const lobby = sessionManager.getLobby(lobbyId);
        if (!lobby) {
          socket.emit('game_error', { message: 'Lobby not found' });
          return;
        }

        // Verify caller is host
        if (lobby.hostId !== playerId) {
          socket.emit('game_error', { message: 'Only host can finalize estimate' });
          return;
        }

        estimationManager.hostFinalizeEstimate(lobbyId, playerId, data.estimate);
        console.log(`Host finalized estimate with value ${data.estimate} in lobby ${lobbyId}`);
      } catch (error) {
        socket.emit('game_error', { message: (error as Error).message });
      }
    });

    // ============================================================================
    // COMBAT DOMAIN HANDLERS (using CombatManager)
    // ============================================================================

    // Start combat (host initiates combat for a ticket)
    socket.on('start_combat' as any, (data: { ticketIndex?: number }) => {
      const playerId = socket.data.playerId;
      const lobbyId = socket.data.lobbyId;
      if (!playerId || !lobbyId) return;

      const lobby = sessionManager.getLobby(lobbyId);
      if (!lobby) {
        socket.emit('game_error', { code: 'LOBBY_NOT_FOUND', message: 'Lobby not found' });
        return;
      }

      // Verify host
      if (lobby.hostId !== playerId) {
        socket.emit('game_error', { code: 'NOT_HOST', message: 'Only host can start combat' });
        return;
      }

      // Initialize combat with active players
      const players = lobby.players.map(p => ({ id: p.id, team: p.team }));
      combatManager.initializeCombat(lobbyId, players, data.ticketIndex ?? 0);

      console.log(`Combat initialized for lobby ${lobbyId}`);
    });

    // Player attacks boss
    socket.on('attack_boss' as any, (data: { damage?: number }) => {
      try {
        const playerId = socket.data.playerId;
        const lobbyId = socket.data.lobbyId;
        if (!playerId || !lobbyId) return;

        const damage = combatManager.playerAttackBoss(lobbyId, playerId);
        // Damage broadcast via eventBus (Phase 5), no need to emit here
        console.log(`Player ${playerId} attacked boss for ${damage} damage`);
      } catch (error) {
        if (error instanceof CombatNotActiveError || error instanceof PlayerNotInCombatError) {
          socket.emit('game_error', { code: (error as any).code, message: error.message });
        } else {
          throw error;
        }
      }
    });

    // Player heals teammate
    socket.on('heal_teammate' as any, (data: { targetId: string }) => {
      try {
        const playerId = socket.data.playerId;
        const lobbyId = socket.data.lobbyId;
        if (!playerId || !lobbyId) return;

        combatManager.playerHealTeammate(lobbyId, playerId, data.targetId);
        console.log(`Player ${playerId} healed ${data.targetId}`);
      } catch (error) {
        if (error instanceof CombatNotActiveError || error instanceof NotHealerClassError) {
          socket.emit('game_error', { code: (error as any).code, message: error.message });
        } else {
          throw error;
        }
      }
    });

    // Start revival
    socket.on('start_revival' as any, (data: { targetId: string }) => {
      try {
        const playerId = socket.data.playerId;
        const lobbyId = socket.data.lobbyId;
        if (!playerId || !lobbyId) return;

        const started = combatManager.startRevival(lobbyId, playerId, data.targetId);
        if (!started) {
          socket.emit('game_error', { code: 'REVIVAL_CONDITIONS_NOT_MET', message: 'Cannot start revival' });
        } else {
          console.log(`Player ${playerId} started reviving ${data.targetId}`);
        }
      } catch (error) {
        if (error instanceof RevivalNotAllowedError) {
          socket.emit('game_error', { code: (error as any).code, message: error.message });
        } else {
          throw error;
        }
      }
    });

    // Cancel revival
    socket.on('cancel_revival' as any, () => {
      const playerId = socket.data.playerId;
      if (!playerId) return;

      combatManager.cancelRevival(playerId, 'player_cancelled');
      console.log(`Player ${playerId} cancelled revival`);
    });

    // Attack minion (player targeting spectator minion)
    socket.on('attack_minion', (data: { minionPlayerId: string }) => {
      try {
        const playerId = socket.data.playerId;
        const lobbyId = socket.data.lobbyId;
        if (!playerId || !lobbyId) return;

        const damage = combatManager.playerAttackMinion(
          lobbyId,
          playerId,
          data.minionPlayerId
        );

        // Combat events are emitted by CombatManager, no additional emit needed
        console.log(`Player ${playerId} attacked minion ${data.minionPlayerId} for ${damage} damage`);
      } catch (error) {
        socket.emit('game_error', { message: (error as Error).message });
      }
    });

    socket.on('disconnect', (reason) => {
      activeConnections--;
      const playerId = socket.data.playerId;
      const lobbyId = socket.data.lobbyId;

      // Track disconnect reasons for monitoring
      disconnectReasons.set(reason, (disconnectReasons.get(reason) || 0) + 1);

      // Enhanced logging for host disconnects
      const lobby = lobbyId ? sessionManager.getLobby(lobbyId) : null;
      const isHost = lobby && lobby.hostId === playerId;

      console.log(`❌ Player disconnected: ${socket.id}`);
      console.log(`   - Reason: ${reason}`);
      console.log(`   - Is Host: ${isHost ? 'YES ⚠️' : 'no'}`);
      console.log(`   - Lobby: ${lobbyId || 'none'}`);
      console.log(`   - Active connections: ${activeConnections}`);

      if (playerId) {
        // Use SessionManager reconnection system
        const disconnectResult = sessionManager.handlePlayerDisconnect(playerId);
        if (disconnectResult && lobbyId) {
          const { disconnectedPlayer, reconnectToken, hostTransfer } = disconnectResult;

          // Notify other players about the disconnection (but keep player in lobby)
          io.to(lobbyId).emit('player_disconnected', { playerId });

          const graceMinutes = Math.floor((disconnectedPlayer.graceExpiresAt - Date.now()) / 60000);
          console.log(`🔄 Player ${disconnectedPlayer.playerName} (${playerId}) can reconnect for ${graceMinutes} minutes`);

          // If host was transferred, notify all players and update lobby
          if (hostTransfer) {
            io.to(lobbyId).emit('host_transferred', {
              oldHostId: hostTransfer.oldHostId,
              newHostId: hostTransfer.newHostId,
              newHostName: hostTransfer.newHostName,
              reason: 'Host disconnected'
            });

            // Emit lobby update with new host information
            const updatedLobby = sessionManager.getLobby(lobbyId);
            if (updatedLobby) {
              // Keep lobby_updated for host transfer (not yet covered by fine-grained events)
              io.to(lobbyId).emit('lobby_updated', { lobby: updatedLobby });
            }

            console.log(`👑 Host transferred from ${hostTransfer.oldHostId} → ${hostTransfer.newHostName} (${hostTransfer.newHostId})`);
          }
        } else {
          // Fallback to old behavior if reconnection setup fails
          const updatedLobby = sessionManager.removePlayer(playerId);
          if (updatedLobby && lobbyId) {
            io.to(lobbyId).emit('player_disconnected', { playerId });
            // Keep lobby_updated for player removal fallback (not yet covered by fine-grained events)
            io.to(lobbyId).emit('lobby_updated', { lobby: updatedLobby });
          }
          console.log(`⚠️ Player ${playerId} removed immediately (reconnection unavailable)`);
        }
      }
    });
  });

  return io;
}
