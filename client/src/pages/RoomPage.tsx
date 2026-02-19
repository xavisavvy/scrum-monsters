import { useParams } from 'react-router';
import { RoomJoin } from '@/components/game/RoomJoin';

/**
 * Recurring meeting room route - handles /room/:roomId
 * Shows create/join UI for recurring rooms
 */
export default function RoomPage() {
  const { roomId } = useParams<{ roomId: string }>();

  return <RoomJoin roomId={roomId || ''} onLobbyCreatedOrJoined={() => {}} />;
}
