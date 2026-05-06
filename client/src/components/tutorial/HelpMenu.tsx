import { HelpCircle } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { useTutorial } from '@/lib/stores/useTutorial';
import { toast } from 'sonner';

export function HelpMenu() {
  const { startTutorial, resetAllTutorials } = useTutorial();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          data-hint-target="help-menu"
          className="p-2 rounded-lg bg-gray-900/80 border border-gray-600 hover:border-amber-500/50 transition-colors"
          aria-label="Help menu"
        >
          <HelpCircle className="w-5 h-5 text-gray-400" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-72 bg-gray-900/95 border-amber-500/40 z-[200]"
        side="top"
        sideOffset={8}
        collisionPadding={16}
      >
        <div className="flex flex-col gap-2">
          <h3 className="font-bold text-amber-400 text-sm">Help</h3>
          <button
            onClick={() => {
              startTutorial('battle-basics');
              toast('Tutorial started!', { id: 'tutorial-restart' });
            }}
            className="block w-full text-left px-2 py-1.5 rounded hover:bg-gray-800 text-gray-200 text-sm whitespace-nowrap"
          >
            Replay Tutorial
          </button>
          <button
            onClick={() => {
              resetAllTutorials();
              toast('All tutorials reset', { id: 'tutorial-reset' });
            }}
            className="block w-full text-left px-2 py-1.5 rounded hover:bg-gray-800 text-gray-400 text-xs whitespace-nowrap"
          >
            Reset All Hints
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
