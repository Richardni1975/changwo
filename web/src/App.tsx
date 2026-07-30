import { useState, useCallback } from 'react';
import { Room } from './pages/Room';
import { CreateRoom } from './pages/CreateRoom';
import { ErrorBoundary } from './components/ErrorFallback';

type Page = 'create' | 'room';

export function App() {
  const [page, setPage] = useState<Page>('create');
  const [roomId, setRoomId] = useState<string | null>(null);

  const handleRoomCreated = useCallback((id: string) => {
    setRoomId(id);
    setPage('room');
  }, []);

  const handleBack = useCallback(() => {
    setPage('create');
    setRoomId(null);
  }, []);

  return (
    <ErrorBoundary>
      <div className="min-h-dvh bg-surface text-text-primary">
        {page === 'create' && <CreateRoom onCreated={handleRoomCreated} />}
        {page === 'room' && roomId && <Room roomId={roomId} onBack={handleBack} />}
      </div>
    </ErrorBoundary>
  );
}
