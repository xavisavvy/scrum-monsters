import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from '@/components/ui/dialog';
import { RetroButton } from '@/components/ui/retro-button';
import type { Lobby, Player, TimerSettings, JiraSettings, EstimationSettings, EstimationScaleType } from '@/lib/gameTypes';
import { ESTIMATION_SCALES } from '@/lib/gameTypes';

interface LobbySettingsDialogProps {
  currentLobby: Lobby;
  currentPlayer: Player | null;
  isHost: boolean;
  onTimerUpdate: (settings: TimerSettings) => void;
  onJiraUpdate: (settings: JiraSettings) => void;
  onEstimationUpdate: (settings: EstimationSettings) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LobbySettingsDialog({
  currentLobby,
  currentPlayer,
  isHost,
  onTimerUpdate,
  onJiraUpdate,
  onEstimationUpdate,
  open,
  onOpenChange,
}: LobbySettingsDialogProps) {
  // Dialog trigger is host-gated; render nothing for non-hosts
  if (!isHost) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <RetroButton size="sm" variant="secondary">
          ⚙️ Settings
        </RetroButton>
      </DialogTrigger>
      <DialogContent className="bg-gray-900 border-gray-600 text-white max-w-md w-[95vw] sm:w-full max-h-[80vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold retro-text-glow">⚙️ Lobby Settings</DialogTitle>
          <DialogDescription className="text-gray-400">
            Configure settings for this lobby session
          </DialogDescription>
        </DialogHeader>

        {/* Estimation Timer Section */}
        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-200 mb-4">Estimation Timer</h3>
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500 focus:ring-2"
                    checked={currentLobby.timerSettings?.enabled || false}
                    onChange={(e) => onTimerUpdate({
                      enabled: e.target.checked,
                      durationMinutes: currentLobby.timerSettings?.durationMinutes || 5
                    })}
                  />
                  <span className="text-sm font-medium">Enable estimation timer</span>
                </label>
              </div>

              {currentLobby.timerSettings?.enabled && (
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-300" htmlFor="timerDuration">
                    Timer Duration
                  </label>
                  <select
                    name='timerDuration'
                    className="retro-input w-full"
                    value={currentLobby.timerSettings?.durationMinutes || 5}
                    onChange={(e) => onTimerUpdate({
                      enabled: true,
                      durationMinutes: parseInt(e.target.value)
                    })}
                  >
                    <option value={1}>1 minute</option>
                    <option value={2}>2 minutes</option>
                    <option value={3}>3 minutes</option>
                    <option value={5}>5 minutes</option>
                    <option value={10}>10 minutes</option>
                    <option value={15}>15 minutes</option>
                  </select>
                  <p className="text-xs text-gray-400">
                    ⏰ Scores will auto-reveal when timer expires
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* JIRA Integration Section */}
          <div className="border-t border-gray-700 pt-6">
            <h3 className="text-lg font-semibold text-gray-200 mb-4">JIRA Integration</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2" htmlFor='jiraBaseUrl'>
                  JIRA Base URL
                </label>
                <input
                  name='jiraBaseUrl'
                  type="url"
                  placeholder="https://yourcompany.atlassian.net/browse/"
                  className="retro-input w-full"
                  value={currentLobby.jiraSettings?.baseUrl || ''}
                  onChange={(e) => onJiraUpdate({
                    baseUrl: e.target.value.trim() || undefined
                  })}
                />
                <p className="text-xs text-gray-400 mt-1">
                  🔗 When set, ticket names become clickable links to your JIRA instance
                </p>
              </div>
            </div>
          </div>

          {/* Estimation Scale Section */}
          <div className="border-t border-gray-700 pt-6">
            <h3 className="text-lg font-semibold text-gray-200 mb-4">Estimation Scale</h3>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-300" htmlFor='estimationScaleType'>
                  Scale Type
                </label>
                <select
                  name='estimationScaleType'
                  className="retro-input w-full"
                  value={currentLobby.estimationSettings?.scaleType || 'fibonacci'}
                  onChange={(e) => onEstimationUpdate({
                    scaleType: e.target.value as EstimationScaleType,
                    customTshirtMapping: currentLobby.estimationSettings?.customTshirtMapping
                  })}
                >
                  <option value="fibonacci">Fibonacci (1, 2, 3, 5, 8, 13...)</option>
                  <option value="doubling">Doubling (1, 2, 4, 8, 16, 32...)</option>
                  <option value="tshirt">T-Shirt Sizes (XS, S, M, L, XL)</option>
                </select>
              </div>

              {/* Phase 42-02a / FIX-05: host-only auto-advance toggle (default OFF) */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500 focus:ring-2"
                  checked={currentLobby.estimationSettings?.autoAdvance ?? false}
                  onChange={(e) => onEstimationUpdate({
                    scaleType: currentLobby.estimationSettings?.scaleType ?? 'fibonacci',
                    customTshirtMapping: currentLobby.estimationSettings?.customTshirtMapping,
                    autoAdvance: e.target.checked,
                  })}
                  disabled={!currentPlayer?.isHost || currentLobby?.gamePhase !== 'lobby'}
                />
                <span className="text-sm font-medium">Auto-advance to next ticket on consensus (5s countdown)</span>
              </label>

              {/* T-shirt size point mapping */}
              {(currentLobby.estimationSettings?.scaleType || 'fibonacci') === 'tshirt' && (
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-300" htmlFor='customTshirtMapping'>
                    T-Shirt Size Point Values
                  </label>
                  <div className="grid grid-cols-5 gap-2" id='customTshirtMapping'>
                    {['XS', 'S', 'M', 'L', 'XL'].map(size => (
                      <div key={size} className="space-y-1">
                        <label className="block text-xs text-gray-400 text-center">{size}</label>
                        <input
                          type="number"
                          min="0"
                          className="retro-input w-full text-center text-xs"
                          value={currentLobby.estimationSettings?.customTshirtMapping?.[size] || ESTIMATION_SCALES.tshirt.pointMapping![size]}
                          onChange={(e) => {
                            const newMapping = {
                              ...ESTIMATION_SCALES.tshirt.pointMapping,
                              ...currentLobby.estimationSettings?.customTshirtMapping,
                              [size]: parseInt(e.target.value) || 0
                            };
                            onEstimationUpdate({
                              scaleType: 'tshirt',
                              customTshirtMapping: newMapping
                            });
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
