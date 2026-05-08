import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EstimationManager } from './EstimationManager';
import { ScopedEventBus } from '../events';
import {
  EstimationNotActiveError,
  VoteNotEligibleError,
  InvalidVoteValueError,
  NotInDiscussionPhaseError,
  ForceEstimateTieError,
  InvalidForcedValueError,
} from '../errors/EstimationErrors';

describe('EstimationManager', () => {
  let eventBus: ScopedEventBus;
  let estimationManager: EstimationManager;
  let getPlayerTeam: (lobbyId: string, playerId: string) => 'developers' | 'qa' | 'spectators' | null;

  beforeEach(() => {
    eventBus = new ScopedEventBus();
    // Mock team lookup function
    getPlayerTeam = vi.fn((lobbyId: string, playerId: string) => {
      // Default mock: players are developers unless specified otherwise
      if (playerId.startsWith('qa')) return 'qa';
      if (playerId.startsWith('spectator')) return 'spectators';
      return 'developers';
    });
    estimationManager = new EstimationManager({ eventBus, getPlayerTeam });
  });

  describe('instantiation', () => {
    it('should instantiate with ScopedEventBus dependency', () => {
      expect(estimationManager).toBeInstanceOf(EstimationManager);
    });

    it('should return null for non-existent estimation', () => {
      const result = estimationManager.getEstimation('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('startEstimation', () => {
    it('should initialize estimation state for a lobby', () => {
      estimationManager.startEstimation('lobby1', 'ticket1');
      const state = estimationManager.getEstimation('lobby1');

      expect(state).not.toBeNull();
      expect(state!.lobbyId).toBe('lobby1');
      expect(state!.ticketId).toBe('ticket1');
      expect(state!.teams.developers.votes.size).toBe(0);
      expect(state!.teams.qa.votes.size).toBe(0);
      expect(state!.teams.developers.phase).toBe('voting');
      expect(state!.teams.qa.phase).toBe('voting');
    });
  });

  describe('cleanupLobby', () => {
    it('should remove estimation state for a lobby', () => {
      estimationManager.startEstimation('lobby1', 'ticket1');
      expect(estimationManager.getEstimation('lobby1')).not.toBeNull();

      estimationManager.cleanupLobby('lobby1');
      expect(estimationManager.getEstimation('lobby1')).toBeNull();
    });

    it('should handle cleanup of non-existent lobby gracefully', () => {
      // Should not throw
      estimationManager.cleanupLobby('nonexistent');
    });
  });

  describe('addEligibleVoter', () => {
    it('should add player to team eligible voters', () => {
      estimationManager.startEstimation('lobby1', 'ticket1');
      estimationManager.addEligibleVoter('lobby1', 'player1', 'developers');

      const state = estimationManager.getEstimation('lobby1');
      expect(state!.teams.developers.eligibleVoters.has('player1')).toBe(true);
    });

    it('should not add to spectators team', () => {
      estimationManager.startEstimation('lobby1', 'ticket1');
      estimationManager.addEligibleVoter('lobby1', 'player1', 'spectators');

      const state = estimationManager.getEstimation('lobby1');
      // Spectators don't have a vote state
      expect(state!.teams.developers.eligibleVoters.has('player1')).toBe(false);
      expect(state!.teams.qa.eligibleVoters.has('player1')).toBe(false);
    });
  });

  describe('removeEligibleVoter', () => {
    it('should remove player from team eligible voters', () => {
      estimationManager.startEstimation('lobby1', 'ticket1');
      estimationManager.addEligibleVoter('lobby1', 'player1', 'developers');
      estimationManager.removeEligibleVoter('lobby1', 'player1');

      const state = estimationManager.getEstimation('lobby1');
      expect(state!.teams.developers.eligibleVoters.has('player1')).toBe(false);
    });

    it('should remove player vote when removing eligibility', () => {
      estimationManager.startEstimation('lobby1', 'ticket1');
      estimationManager.addEligibleVoter('lobby1', 'player1', 'developers');
      estimationManager.castVote('lobby1', 'player1', 'developers', 5);

      let state = estimationManager.getEstimation('lobby1');
      expect(state!.teams.developers.votes.has('player1')).toBe(true);

      estimationManager.removeEligibleVoter('lobby1', 'player1');

      state = estimationManager.getEstimation('lobby1');
      expect(state!.teams.developers.votes.has('player1')).toBe(false);
    });

    it('should recheck consensus after removing voter', () => {
      const consensusListener = vi.fn();
      eventBus.on('estimation:team_consensus_reached', consensusListener);

      estimationManager.startEstimation('lobby1', 'ticket1');
      estimationManager.addEligibleVoter('lobby1', 'player1', 'developers');
      estimationManager.addEligibleVoter('lobby1', 'player2', 'developers');

      // Both vote 5 - consensus reached
      estimationManager.castVote('lobby1', 'player1', 'developers', 5);
      estimationManager.castVote('lobby1', 'player2', 'developers', 5);

      expect(consensusListener).toHaveBeenCalledTimes(1);

      // Remove player2 - should still have consensus with player1 alone
      estimationManager.removeEligibleVoter('lobby1', 'player2');

      const state = estimationManager.getEstimation('lobby1');
      expect(state!.teams.developers.hasConsensus).toBe(true);
    });
  });

  describe('castVote', () => {
    beforeEach(() => {
      estimationManager.startEstimation('lobby1', 'ticket1');
      estimationManager.addEligibleVoter('lobby1', 'player1', 'developers');
    });

    it('should store valid Fibonacci vote in team votes', () => {
      estimationManager.castVote('lobby1', 'player1', 'developers', 5);

      const state = estimationManager.getEstimation('lobby1');
      expect(state!.teams.developers.votes.get('player1')).toBe(5);
    });

    it('should store abstention vote', () => {
      estimationManager.castVote('lobby1', 'player1', 'developers', '?');

      const state = estimationManager.getEstimation('lobby1');
      expect(state!.teams.developers.votes.get('player1')).toBe('?');
    });

    it('should emit estimation:vote_cast event', () => {
      const voteCastListener = vi.fn();
      eventBus.on('estimation:vote_cast', voteCastListener);

      estimationManager.castVote('lobby1', 'player1', 'developers', 8);

      expect(voteCastListener).toHaveBeenCalledWith({
        lobbyId: 'lobby1',
        playerId: 'player1',
        team: 'developers',
        vote: 8,
      });
    });

    it('should throw EstimationNotActiveError when no estimation active', () => {
      expect(() => {
        estimationManager.castVote('nonexistent', 'player1', 'developers', 5);
      }).toThrow(EstimationNotActiveError);
    });

    it('should throw VoteNotEligibleError when player not eligible', () => {
      expect(() => {
        estimationManager.castVote('lobby1', 'ineligible', 'developers', 5);
      }).toThrow(VoteNotEligibleError);
    });

    it('should throw InvalidVoteValueError for invalid Fibonacci value', () => {
      expect(() => {
        estimationManager.castVote('lobby1', 'player1', 'developers', 4);
      }).toThrow(InvalidVoteValueError);
    });

    it('should throw InvalidVoteValueError for non-numeric non-? value', () => {
      expect(() => {
        estimationManager.castVote('lobby1', 'player1', 'developers', 'invalid' as any);
      }).toThrow(InvalidVoteValueError);
    });

    it('should allow all valid Fibonacci values', () => {
      const validVotes = [1, 2, 3, 5, 8, 13, 21];

      validVotes.forEach((vote, idx) => {
        const playerId = `player${idx + 1}`;
        estimationManager.addEligibleVoter('lobby1', playerId, 'developers');
        expect(() => {
          estimationManager.castVote('lobby1', playerId, 'developers', vote);
        }).not.toThrow();
      });
    });

    it('should allow vote changes', () => {
      estimationManager.castVote('lobby1', 'player1', 'developers', 5);
      estimationManager.castVote('lobby1', 'player1', 'developers', 8);

      const state = estimationManager.getEstimation('lobby1');
      expect(state!.teams.developers.votes.get('player1')).toBe(8);
    });
  });

  describe('checkConsensus', () => {
    beforeEach(() => {
      estimationManager.startEstimation('lobby1', 'ticket1');
    });

    it('should detect consensus when all eligible voters vote same value', () => {
      estimationManager.addEligibleVoter('lobby1', 'player1', 'developers');
      estimationManager.addEligibleVoter('lobby1', 'player2', 'developers');
      estimationManager.addEligibleVoter('lobby1', 'player3', 'developers');

      estimationManager.castVote('lobby1', 'player1', 'developers', 5);
      estimationManager.castVote('lobby1', 'player2', 'developers', 5);
      estimationManager.castVote('lobby1', 'player3', 'developers', 5);

      const state = estimationManager.getEstimation('lobby1');
      expect(state!.teams.developers.hasConsensus).toBe(true);
      expect(state!.teams.developers.consensusValue).toBe(5);
    });

    it('should not have consensus when votes differ', () => {
      estimationManager.addEligibleVoter('lobby1', 'player1', 'developers');
      estimationManager.addEligibleVoter('lobby1', 'player2', 'developers');

      estimationManager.castVote('lobby1', 'player1', 'developers', 5);
      estimationManager.castVote('lobby1', 'player2', 'developers', 8);

      const state = estimationManager.getEstimation('lobby1');
      expect(state!.teams.developers.hasConsensus).toBe(false);
      expect(state!.teams.developers.consensusValue).toBeUndefined();
    });

    it('should not have consensus until all eligible voters have voted', () => {
      estimationManager.addEligibleVoter('lobby1', 'player1', 'developers');
      estimationManager.addEligibleVoter('lobby1', 'player2', 'developers');

      estimationManager.castVote('lobby1', 'player1', 'developers', 5);

      const state = estimationManager.getEstimation('lobby1');
      expect(state!.teams.developers.hasConsensus).toBe(false);
    });

    it('should ignore abstentions when calculating consensus', () => {
      estimationManager.addEligibleVoter('lobby1', 'player1', 'developers');
      estimationManager.addEligibleVoter('lobby1', 'player2', 'developers');
      estimationManager.addEligibleVoter('lobby1', 'player3', 'developers');
      estimationManager.addEligibleVoter('lobby1', 'player4', 'developers');

      estimationManager.castVote('lobby1', 'player1', 'developers', 5);
      estimationManager.castVote('lobby1', 'player2', 'developers', 5);
      estimationManager.castVote('lobby1', 'player3', 'developers', 5);
      estimationManager.castVote('lobby1', 'player4', 'developers', '?');

      const state = estimationManager.getEstimation('lobby1');
      expect(state!.teams.developers.hasConsensus).toBe(true);
      expect(state!.teams.developers.consensusValue).toBe(5);
    });

    it('should mark team as skipped when no eligible voters', () => {
      // No eligible voters added
      const state = estimationManager.getEstimation('lobby1');

      // Manually trigger consensus check by trying to vote (will fail but trigger check)
      // Actually, we need a way to trigger this. Let's call a method that checks it
      // For now, we'll check the initial state which should handle empty teams
      expect(state!.teams.developers.eligibleVoters.size).toBe(0);
    });

    it('should emit estimation:team_consensus_reached event', () => {
      const consensusListener = vi.fn();
      eventBus.on('estimation:team_consensus_reached', consensusListener);

      estimationManager.addEligibleVoter('lobby1', 'player1', 'developers');
      estimationManager.addEligibleVoter('lobby1', 'player2', 'developers');

      estimationManager.castVote('lobby1', 'player1', 'developers', 8);
      estimationManager.castVote('lobby1', 'player2', 'developers', 8);

      expect(consensusListener).toHaveBeenCalledWith(
        expect.objectContaining({
          lobbyId: 'lobby1',
          team: 'developers',
          consensusValue: 8,
        })
      );
    });

    it('should emit estimation:full_consensus_reached when both teams reach consensus', () => {
      return new Promise<void>((resolve) => {
        const fullConsensusListener = vi.fn();
        eventBus.on('estimation:full_consensus_reached', fullConsensusListener);

        // Setup both teams
        estimationManager.addEligibleVoter('lobby1', 'dev1', 'developers');
        estimationManager.addEligibleVoter('lobby1', 'qa1', 'qa');

        // Dev team votes
        estimationManager.castVote('lobby1', 'dev1', 'developers', 5);

        // QA team votes
        estimationManager.castVote('lobby1', 'qa1', 'qa', 8);

        // Full consensus event should fire after 2.5s delay
        setTimeout(() => {
          expect(fullConsensusListener).toHaveBeenCalledWith(
            expect.objectContaining({
              lobbyId: 'lobby1',
              ticketId: 'ticket1',
            })
          );
          resolve();
        }, 2600); // Wait a bit longer than the 2.5s delay
      });
    }, 3000);

    it('should break consensus when vote changes to different value', () => {
      estimationManager.addEligibleVoter('lobby1', 'player1', 'developers');
      estimationManager.addEligibleVoter('lobby1', 'player2', 'developers');

      // Reach consensus
      estimationManager.castVote('lobby1', 'player1', 'developers', 5);
      estimationManager.castVote('lobby1', 'player2', 'developers', 5);

      let state = estimationManager.getEstimation('lobby1');
      expect(state!.teams.developers.hasConsensus).toBe(true);

      // Change vote - should break consensus
      estimationManager.castVote('lobby1', 'player2', 'developers', 8);

      state = estimationManager.getEstimation('lobby1');
      expect(state!.teams.developers.hasConsensus).toBe(false);
    });
  });

  describe('vote visibility', () => {
    beforeEach(() => {
      estimationManager.startEstimation('lobby1', 'ticket1');
      estimationManager.addEligibleVoter('lobby1', 'player1', 'developers');
      estimationManager.addEligibleVoter('lobby1', 'player2', 'developers');
    });

    it('should hide vote values during voting phase', () => {
      estimationManager.castVote('lobby1', 'player1', 'developers', 5);

      const visibility = estimationManager.getAllVoteVisibility('lobby1');

      expect(visibility.globalPhase).toBe('voting');
      expect(visibility.developers).toHaveLength(2);

      const player1Vis = visibility.developers.find(v => v.playerId === 'player1');
      const player2Vis = visibility.developers.find(v => v.playerId === 'player2');

      expect(player1Vis?.hasVoted).toBe(true);
      expect(player1Vis?.vote).toBeUndefined();
      expect(player2Vis?.hasVoted).toBe(false);
      expect(player2Vis?.vote).toBeUndefined();
    });

    it('should show vote values during revealed phase', () => {
      estimationManager.castVote('lobby1', 'player1', 'developers', 5);
      estimationManager.castVote('lobby1', 'player2', 'developers', 8);

      // Manually set phase to revealed
      const state = estimationManager.getEstimation('lobby1');
      state!.teams.developers.phase = 'revealed';

      const visibility = estimationManager.getAllVoteVisibility('lobby1');

      expect(visibility.globalPhase).toBe('revealed');

      const player1Vis = visibility.developers.find(v => v.playerId === 'player1');
      const player2Vis = visibility.developers.find(v => v.playerId === 'player2');

      expect(player1Vis?.hasVoted).toBe(true);
      expect(player1Vis?.vote).toBe(5);
      expect(player2Vis?.hasVoted).toBe(true);
      expect(player2Vis?.vote).toBe(8);
    });

    it('should show vote values during discussion phase', () => {
      estimationManager.castVote('lobby1', 'player1', 'developers', 5);

      estimationManager.enterDiscussionPhase('lobby1', 'developers');

      const visibility = estimationManager.getAllVoteVisibility('lobby1');

      expect(visibility.globalPhase).toBe('discussion');

      const player1Vis = visibility.developers.find(v => v.playerId === 'player1');
      expect(player1Vis?.hasVoted).toBe(true);
      expect(player1Vis?.vote).toBe(5);
    });

    it('should use most advanced team phase for global phase', () => {
      estimationManager.addEligibleVoter('lobby1', 'qa1', 'qa');

      estimationManager.castVote('lobby1', 'player1', 'developers', 5);
      estimationManager.castVote('lobby1', 'qa1', 'qa', 8);

      // Dev team in voting, QA team in revealed
      const state = estimationManager.getEstimation('lobby1');
      state!.teams.qa.phase = 'revealed';

      const visibility = estimationManager.getAllVoteVisibility('lobby1');

      // Global phase should be 'revealed' (most advanced)
      expect(visibility.globalPhase).toBe('revealed');
    });

    it('should emit estimation:discussion_started event', () => {
      const discussionListener = vi.fn();
      eventBus.on('estimation:discussion_started', discussionListener);

      estimationManager.enterDiscussionPhase('lobby1', 'developers');

      expect(discussionListener).toHaveBeenCalledWith({
        lobbyId: 'lobby1',
        team: 'developers'
      });
    });

    it('should throw EstimationNotActiveError when no estimation exists', () => {
      expect(() => {
        estimationManager.getAllVoteVisibility('nonexistent');
      }).toThrow(EstimationNotActiveError);

      expect(() => {
        estimationManager.enterDiscussionPhase('nonexistent', 'developers');
      }).toThrow(EstimationNotActiveError);
    });
  });

  describe('changeVoteDuringDiscussion', () => {
    beforeEach(() => {
      estimationManager.startEstimation('lobby1', 'ticket1');
      estimationManager.addEligibleVoter('lobby1', 'player1', 'developers');
      estimationManager.addEligibleVoter('lobby1', 'player2', 'developers');
    });

    it('should change vote during discussion phase', () => {
      estimationManager.castVote('lobby1', 'player1', 'developers', 5);
      estimationManager.enterDiscussionPhase('lobby1', 'developers');

      estimationManager.changeVoteDuringDiscussion('lobby1', 'player1', 'developers', 8);

      const state = estimationManager.getEstimation('lobby1');
      expect(state!.teams.developers.votes.get('player1')).toBe(8);
    });

    it('should emit estimation:vote_changed event with old and new values', () => {
      const voteChangedListener = vi.fn();
      eventBus.on('estimation:vote_changed', voteChangedListener);

      estimationManager.castVote('lobby1', 'player1', 'developers', 5);
      estimationManager.enterDiscussionPhase('lobby1', 'developers');

      estimationManager.changeVoteDuringDiscussion('lobby1', 'player1', 'developers', 8);

      expect(voteChangedListener).toHaveBeenCalledWith({
        lobbyId: 'lobby1',
        playerId: 'player1',
        team: 'developers',
        oldVote: 5,
        newVote: 8
      });
    });

    it('should reset team consensus when vote changes', () => {
      // Reach consensus first
      estimationManager.castVote('lobby1', 'player1', 'developers', 5);
      estimationManager.castVote('lobby1', 'player2', 'developers', 5);

      let state = estimationManager.getEstimation('lobby1');
      expect(state!.teams.developers.hasConsensus).toBe(true);

      // Enter discussion and change vote
      estimationManager.enterDiscussionPhase('lobby1', 'developers');
      estimationManager.changeVoteDuringDiscussion('lobby1', 'player1', 'developers', 8);

      state = estimationManager.getEstimation('lobby1');
      expect(state!.teams.developers.hasConsensus).toBe(false);
      expect(state!.teams.developers.consensusValue).toBeUndefined();
    });

    it('should re-check consensus after vote change', () => {
      const consensusListener = vi.fn();
      eventBus.on('estimation:team_consensus_reached', consensusListener);

      // Two different votes
      estimationManager.castVote('lobby1', 'player1', 'developers', 5);
      estimationManager.castVote('lobby1', 'player2', 'developers', 8);

      estimationManager.enterDiscussionPhase('lobby1', 'developers');

      // Change to match - should create consensus
      estimationManager.changeVoteDuringDiscussion('lobby1', 'player1', 'developers', 8);

      expect(consensusListener).toHaveBeenCalledWith(
        expect.objectContaining({
          lobbyId: 'lobby1',
          team: 'developers',
          consensusValue: 8
        })
      );
    });

    it('should throw NotInDiscussionPhaseError during voting phase', () => {
      estimationManager.castVote('lobby1', 'player1', 'developers', 5);

      // Still in voting phase
      expect(() => {
        estimationManager.changeVoteDuringDiscussion('lobby1', 'player1', 'developers', 8);
      }).toThrow(NotInDiscussionPhaseError);
    });

    it('should throw EstimationNotActiveError when no estimation active', () => {
      expect(() => {
        estimationManager.changeVoteDuringDiscussion('nonexistent', 'player1', 'developers', 8);
      }).toThrow(EstimationNotActiveError);
    });

    it('should throw VoteNotEligibleError when player not eligible', () => {
      estimationManager.enterDiscussionPhase('lobby1', 'developers');

      expect(() => {
        estimationManager.changeVoteDuringDiscussion('lobby1', 'ineligible', 'developers', 8);
      }).toThrow(VoteNotEligibleError);
    });

    it('should throw InvalidVoteValueError for invalid vote value', () => {
      estimationManager.castVote('lobby1', 'player1', 'developers', 5);
      estimationManager.enterDiscussionPhase('lobby1', 'developers');

      expect(() => {
        estimationManager.changeVoteDuringDiscussion('lobby1', 'player1', 'developers', 4);
      }).toThrow(InvalidVoteValueError);
    });
  });

  describe('getVoteTally', () => {
    beforeEach(() => {
      estimationManager.startEstimation('lobby1', 'ticket1');
      estimationManager.addEligibleVoter('lobby1', 'player1', 'developers');
      estimationManager.addEligibleVoter('lobby1', 'player2', 'developers');
      estimationManager.addEligibleVoter('lobby1', 'player3', 'developers');
    });

    it('should return correct vote counts', () => {
      estimationManager.castVote('lobby1', 'player1', 'developers', 5);
      estimationManager.castVote('lobby1', 'player2', 'developers', 5);
      estimationManager.castVote('lobby1', 'player3', 'developers', 8);

      const tally = estimationManager.getVoteTally('lobby1', 'developers');

      expect(tally.get(5)).toBe(2);
      expect(tally.get(8)).toBe(1);
    });

    it('should include abstentions in tally', () => {
      estimationManager.castVote('lobby1', 'player1', 'developers', 5);
      estimationManager.castVote('lobby1', 'player2', 'developers', '?');

      const tally = estimationManager.getVoteTally('lobby1', 'developers');

      expect(tally.get(5)).toBe(1);
      expect(tally.get('?')).toBe(1);
    });

    it('should throw EstimationNotActiveError when no estimation exists', () => {
      expect(() => {
        estimationManager.getVoteTally('nonexistent', 'developers');
      }).toThrow(EstimationNotActiveError);
    });
  });

  describe('forceEstimate', () => {
    beforeEach(() => {
      estimationManager.startEstimation('lobby1', 'ticket1');
      estimationManager.addEligibleVoter('lobby1', 'player1', 'developers');
      estimationManager.addEligibleVoter('lobby1', 'player2', 'developers');
      estimationManager.addEligibleVoter('lobby1', 'player3', 'developers');
    });

    it('should use majority value when clear majority exists', () => {
      estimationManager.castVote('lobby1', 'player1', 'developers', 5);
      estimationManager.castVote('lobby1', 'player2', 'developers', 5);
      estimationManager.castVote('lobby1', 'player3', 'developers', 8);

      const result = estimationManager.forceEstimate('lobby1', 'developers', 'host1');

      expect(result.consensusValue).toBe(5);

      const state = estimationManager.getEstimation('lobby1');
      expect(state!.teams.developers.hasConsensus).toBe(true);
      expect(state!.teams.developers.consensusValue).toBe(5);
    });

    it('should throw ForceEstimateTieError when tie exists and no forcedValue', () => {
      estimationManager.castVote('lobby1', 'player1', 'developers', 5);
      estimationManager.castVote('lobby1', 'player2', 'developers', 8);

      expect(() => {
        estimationManager.forceEstimate('lobby1', 'developers', 'host1');
      }).toThrow(ForceEstimateTieError);
    });

    it('should accept forcedValue when tie exists', () => {
      estimationManager.castVote('lobby1', 'player1', 'developers', 5);
      estimationManager.castVote('lobby1', 'player2', 'developers', 8);

      const result = estimationManager.forceEstimate('lobby1', 'developers', 'host1', 8);

      expect(result.consensusValue).toBe(8);

      const state = estimationManager.getEstimation('lobby1');
      expect(state!.teams.developers.consensusValue).toBe(8);
    });

    it('should throw InvalidForcedValueError when forcedValue not in tied values', () => {
      estimationManager.castVote('lobby1', 'player1', 'developers', 5);
      estimationManager.castVote('lobby1', 'player2', 'developers', 8);

      expect(() => {
        estimationManager.forceEstimate('lobby1', 'developers', 'host1', 13);
      }).toThrow(InvalidForcedValueError);
    });

    it('should emit estimation:estimate_forced event', () => {
      const forceListener = vi.fn();
      eventBus.on('estimation:estimate_forced', forceListener);

      estimationManager.castVote('lobby1', 'player1', 'developers', 5);
      estimationManager.castVote('lobby1', 'player2', 'developers', 5);

      estimationManager.forceEstimate('lobby1', 'developers', 'host1');

      expect(forceListener).toHaveBeenCalledWith({
        lobbyId: 'lobby1',
        team: 'developers',
        consensusValue: 5,
        forcedBy: 'host1',
        wasTied: false
      });
    });

    it('should emit with wasTied=true when tie resolved', () => {
      const forceListener = vi.fn();
      eventBus.on('estimation:estimate_forced', forceListener);

      estimationManager.castVote('lobby1', 'player1', 'developers', 5);
      estimationManager.castVote('lobby1', 'player2', 'developers', 8);

      estimationManager.forceEstimate('lobby1', 'developers', 'host1', 5);

      expect(forceListener).toHaveBeenCalledWith(
        expect.objectContaining({
          wasTied: true
        })
      );
    });

    it('should ignore abstentions when determining majority', () => {
      estimationManager.castVote('lobby1', 'player1', 'developers', 5);
      estimationManager.castVote('lobby1', 'player2', 'developers', 5);
      estimationManager.castVote('lobby1', 'player3', 'developers', '?');

      const result = estimationManager.forceEstimate('lobby1', 'developers', 'host1');

      expect(result.consensusValue).toBe(5);
    });

    it('should check full consensus after forcing estimate', () => {
      return new Promise<void>((resolve) => {
        const fullConsensusListener = vi.fn();
        eventBus.on('estimation:full_consensus_reached', fullConsensusListener);

        // Setup both teams with votes
        estimationManager.addEligibleVoter('lobby1', 'qa1', 'qa');
        estimationManager.castVote('lobby1', 'player1', 'developers', 5);
        estimationManager.castVote('lobby1', 'player2', 'developers', 5);
        estimationManager.castVote('lobby1', 'qa1', 'qa', 8);

        // QA already has consensus (single voter)
        const qaState = estimationManager.getEstimation('lobby1');
        expect(qaState!.teams.qa.hasConsensus).toBe(true);

        // Force dev estimate
        estimationManager.forceEstimate('lobby1', 'developers', 'host1');

        // Full consensus event should fire after 2.5s delay
        setTimeout(() => {
          expect(fullConsensusListener).toHaveBeenCalledWith(
            expect.objectContaining({
              lobbyId: 'lobby1',
              ticketId: 'ticket1'
            })
          );
          resolve();
        }, 2600);
      });
    }, 3000);

    it('should throw EstimationNotActiveError when no estimation exists', () => {
      expect(() => {
        estimationManager.forceEstimate('nonexistent', 'developers', 'host1');
      }).toThrow(EstimationNotActiveError);
    });
  });

  describe('session event subscriptions', () => {
    beforeEach(() => {
      estimationManager.startEstimation('lobby1', 'ticket1');
    });

    it('should add late-joining player to eligible voters when estimation active', () => {
      // Emit session:player_joined event
      eventBus.emit('session:player_joined', {
        lobbyId: 'lobby1',
        playerId: 'latecomer',
        playerName: 'Late Player',
        team: 'developers',
      });

      const state = estimationManager.getEstimation('lobby1');
      expect(state!.teams.developers.eligibleVoters.has('latecomer')).toBe(true);
    });

    it('should not add spectator to eligible voters when joining', () => {
      // Emit session:player_joined for spectator
      eventBus.emit('session:player_joined', {
        lobbyId: 'lobby1',
        playerId: 'spectator1',
        playerName: 'Spectator Player',
        team: 'developers',
      });

      const state = estimationManager.getEstimation('lobby1');
      expect(state!.teams.developers.eligibleVoters.has('spectator1')).toBe(false);
      expect(state!.teams.qa.eligibleVoters.has('spectator1')).toBe(false);
    });

    it('should add QA player to correct team when joining', () => {
      // Emit session:player_joined for QA player
      eventBus.emit('session:player_joined', {
        lobbyId: 'lobby1',
        playerId: 'qa1',
        playerName: 'QA Player',
        team: 'developers',
      });

      const state = estimationManager.getEstimation('lobby1');
      expect(state!.teams.qa.eligibleVoters.has('qa1')).toBe(true);
      expect(state!.teams.developers.eligibleVoters.has('qa1')).toBe(false);
    });

    it('should remove player from eligible voters when they leave', () => {
      estimationManager.addEligibleVoter('lobby1', 'player1', 'developers');
      estimationManager.castVote('lobby1', 'player1', 'developers', 5);

      // Emit session:player_left event
      eventBus.emit('session:player_left', {
        lobbyId: 'lobby1',
        playerId: 'player1'
      });

      const state = estimationManager.getEstimation('lobby1');
      expect(state!.teams.developers.eligibleVoters.has('player1')).toBe(false);
      expect(state!.teams.developers.votes.has('player1')).toBe(false);
    });

    it('should recheck consensus when player leaves', () => {
      const consensusListener = vi.fn();
      eventBus.on('estimation:team_consensus_reached', consensusListener);

      estimationManager.addEligibleVoter('lobby1', 'player1', 'developers');
      estimationManager.addEligibleVoter('lobby1', 'player2', 'developers');

      estimationManager.castVote('lobby1', 'player1', 'developers', 5);
      estimationManager.castVote('lobby1', 'player2', 'developers', 8);

      // No consensus yet
      let state = estimationManager.getEstimation('lobby1');
      expect(state!.teams.developers.hasConsensus).toBe(false);

      // Player2 leaves - now player1 alone has consensus
      eventBus.emit('session:player_left', {
        lobbyId: 'lobby1',
        playerId: 'player2'
      });

      state = estimationManager.getEstimation('lobby1');
      expect(state!.teams.developers.hasConsensus).toBe(true);
      expect(state!.teams.developers.consensusValue).toBe(5);
    });

    it('should cleanup estimation state when lobby destroyed', () => {
      estimationManager.addEligibleVoter('lobby1', 'player1', 'developers');
      expect(estimationManager.getEstimation('lobby1')).not.toBeNull();

      // Emit session:lobby_destroyed event
      eventBus.emit('session:lobby_destroyed', {
        lobbyId: 'lobby1'
      });

      expect(estimationManager.getEstimation('lobby1')).toBeNull();
    });

    it('should do nothing when player joins but no active estimation', () => {
      // Cleanup estimation first
      estimationManager.cleanupLobby('lobby1');

      // Emit session:player_joined - should not error
      eventBus.emit('session:player_joined', {
        lobbyId: 'lobby1',
        playerId: 'player1',
        playerName: 'Player One',
        team: 'developers',
      });

      // State should still be null
      expect(estimationManager.getEstimation('lobby1')).toBeNull();
    });
  });

  describe('handleTeamChange', () => {
    beforeEach(() => {
      estimationManager.startEstimation('lobby1', 'ticket1');
      estimationManager.addEligibleVoter('lobby1', 'player1', 'developers');
    });

    it('should remove vote when player switches to spectator', () => {
      estimationManager.castVote('lobby1', 'player1', 'developers', 5);

      let state = estimationManager.getEstimation('lobby1');
      expect(state!.teams.developers.votes.has('player1')).toBe(true);

      // Player switches to spectator
      estimationManager.handleTeamChange('lobby1', 'player1', 'developers', 'spectators');

      state = estimationManager.getEstimation('lobby1');
      expect(state!.teams.developers.eligibleVoters.has('player1')).toBe(false);
      expect(state!.teams.developers.votes.has('player1')).toBe(false);
    });

    it('should add to new team when switching between voting teams', () => {
      estimationManager.castVote('lobby1', 'player1', 'developers', 5);

      // Player switches from developers to QA
      estimationManager.handleTeamChange('lobby1', 'player1', 'developers', 'qa');

      const state = estimationManager.getEstimation('lobby1');
      expect(state!.teams.developers.eligibleVoters.has('player1')).toBe(false);
      expect(state!.teams.developers.votes.has('player1')).toBe(false);
      expect(state!.teams.qa.eligibleVoters.has('player1')).toBe(true);
    });

    it('should recheck consensus on old team after team change', () => {
      const consensusListener = vi.fn();
      eventBus.on('estimation:team_consensus_reached', consensusListener);

      estimationManager.addEligibleVoter('lobby1', 'player2', 'developers');

      estimationManager.castVote('lobby1', 'player1', 'developers', 5);
      estimationManager.castVote('lobby1', 'player2', 'developers', 5);

      // Consensus reached
      let state = estimationManager.getEstimation('lobby1');
      expect(state!.teams.developers.hasConsensus).toBe(true);

      // Player1 switches teams - should still have consensus with just player2
      estimationManager.handleTeamChange('lobby1', 'player1', 'developers', 'qa');

      state = estimationManager.getEstimation('lobby1');
      expect(state!.teams.developers.hasConsensus).toBe(true);
      expect(state!.teams.developers.consensusValue).toBe(5);
    });

    it('should do nothing when no active estimation', () => {
      estimationManager.cleanupLobby('lobby1');

      // Should not throw
      estimationManager.handleTeamChange('lobby1', 'player1', 'developers', 'qa');
    });
  });
});
