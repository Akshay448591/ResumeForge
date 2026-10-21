import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { api } from './api';

export const useMe = () =>
  useQuery({ queryKey: ['me'], queryFn: api.me, retry: false, staleTime: 5 * 60_000 });

export function usePageTitle(title: string) {
  useEffect(() => {
    document.title = `${title} · ResumeForge`;
  }, [title]);
}
