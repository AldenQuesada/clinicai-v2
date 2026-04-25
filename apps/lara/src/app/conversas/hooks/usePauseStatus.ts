import { useState, useEffect, useCallback, useRef } from 'react';

export interface PauseStatus {
  isPaused: boolean;
  remainingTime: number; // in minutes
  pausedBy: string | null;
  pausedAt: string | null;
}

export function usePauseStatus(conversationId: string | null) {
  const [pauseStatus, setPauseStatus] = useState<PauseStatus>({
    isPaused: false,
    remainingTime: 0,
    pausedBy: null,
    pausedAt: null
  });
  const [isLoading, setIsLoading] = useState(false);
  const lastFetch = useRef(0);

  const fetchStatus = useCallback(async (force = false) => {
    if (!conversationId) return;
    const now = Date.now();
    if (!force && now - lastFetch.current < 2000) return;
    
    try {
      lastFetch.current = now;
      const res = await fetch(`/api/conversations/${conversationId}/pause`);
      if (res.ok) {
        setPauseStatus(await res.json());
      }
    } catch {}
  }, [conversationId]);

  const pauseAgent = async (duration: number) => {
    if (!conversationId) return false;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/conversations/${conversationId}/pause`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ duration })
      });
      if (res.ok) {
        const data = await res.json();
        setPauseStatus(data.pauseStatus);
        return true;
      }
    } catch {} finally {
      setIsLoading(false);
    }
    return false;
  };

  const reactivateAgent = async () => {
    if (!conversationId) return false;
    setIsLoading(true);
    console.log(`[HOOK] Solicitando reativação para: ${conversationId}`);
    try {
      const res = await fetch(`/api/conversations/${conversationId}/pause`, {
        method: 'DELETE'
      });
      console.log(`[HOOK] Resposta da reativação: ${res.status}`);
      if (res.ok) {
        const data = await res.json();
        setPauseStatus(data.pauseStatus);
        console.log(`[HOOK] Reativação concluída com sucesso`);
        return true;
      } else {
        const errData = await res.json().catch(() => ({}));
        console.error(`[HOOK] Falha na reativação:`, errData);
      }
    } catch (err) {
      console.error(`[HOOK] Erro na chamada de reativação:`, err);
    } finally {
      setIsLoading(false);
    }
    return false;
  };

  useEffect(() => {
    fetchStatus(true);
    let interval: NodeJS.Timeout;

    // Apenas sincroniza com a API raramente (1 min) para não fritar o servidor
    const syncInterval = setInterval(() => {
      fetchStatus(false);
    }, 60000);

    // O timer visual reduz localmente a cada 1 segundo sem chamar a API!
    interval = setInterval(() => {
      setPauseStatus(prev => {
        if (!prev.isPaused || prev.remainingTime <= 0) return prev;
        const newTime = Math.max(0, prev.remainingTime - (1 / 60)); // dec 1 sec
        if (newTime === 0) {
          // Quando zera visualmente, pede pra API verificar se realmente acabou
          setTimeout(() => fetchStatus(true), 1000);
        }
        return { ...prev, remainingTime: newTime };
      });
    }, 1000);

    return () => {
      clearInterval(interval);
      clearInterval(syncInterval);
    };
  }, [fetchStatus]);

  return { pauseStatus, isLoading, pauseAgent, reactivateAgent, refreshStatus: () => fetchStatus(true) };
}
