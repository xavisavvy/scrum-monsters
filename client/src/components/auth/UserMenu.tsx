import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/lib/stores/useAuth";
import { User, LogOut, BarChart3, Settings } from "lucide-react";
import { AuthDialog } from "./AuthDialog";

export function UserMenu() {
  const { user, stats, logout, isLoading } = useAuth();
  const [showAuthDialog, setShowAuthDialog] = useState(false);
  const [showStatsDialog, setShowStatsDialog] = useState(false);

  const handleLogout = async () => {
    await logout();
  };

  // Get initials for avatar fallback
  const getInitials = () => {
    if (user?.displayName) {
      return user.displayName
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);
    }
    if (user?.username) {
      return user.username.slice(0, 2).toUpperCase();
    }
    return "??";
  };

  // If not logged in, show sign in button
  if (!user) {
    return (
      <>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowAuthDialog(true)}
          className="gap-2"
        >
          <User className="h-4 w-4" />
          Sign In
        </Button>
        <AuthDialog open={showAuthDialog} onOpenChange={setShowAuthDialog} />
      </>
    );
  }

  // Logged in user menu
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="relative h-9 w-9 rounded-full">
            <Avatar className="h-9 w-9">
              <AvatarImage src={user.avatarUrl || undefined} alt={user.displayName || user.username} />
              <AvatarFallback>{getInitials()}</AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56" align="end" forceMount>
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col space-y-1">
              <p className="text-sm font-medium leading-none">
                {user.displayName || user.username}
              </p>
              {user.email && (
                <p className="text-xs leading-none text-muted-foreground">
                  {user.email}
                </p>
              )}
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setShowStatsDialog(true)}>
            <BarChart3 className="mr-2 h-4 w-4" />
            <span>Stats</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleLogout} disabled={isLoading}>
            <LogOut className="mr-2 h-4 w-4" />
            <span>Log out</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Stats Dialog */}
      <Dialog open={showStatsDialog} onOpenChange={setShowStatsDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Your Stats</DialogTitle>
            <DialogDescription>
              Your ScrumQuest gameplay statistics
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {stats ? (
              <div className="grid grid-cols-2 gap-4">
                <StatItem label="Games Played" value={stats.gamesPlayed} />
                <StatItem label="Tickets Estimated" value={stats.ticketsEstimated} />
                <StatItem label="Bosses Defeated" value={stats.bossesDefeated} />
                <StatItem
                  label="Accuracy"
                  value={`${Math.round((stats.accuracyScore || 0) * 100)}%`}
                />
                <StatItem label="Total Damage" value={stats.totalDamageDealt} />
                <StatItem label="Total Healing" value={stats.totalHealing} />
                <StatItem label="Revives" value={stats.revivesPerformed} />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center">
                No stats available yet. Play some games!
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function StatItem({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex flex-col space-y-1 rounded-lg border p-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-2xl font-bold">{value}</span>
    </div>
  );
}
