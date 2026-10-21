import { configureStore } from '@reduxjs/toolkit';
import { useDispatch, useSelector } from 'react-redux';
import { toast } from 'sonner';
import editor from './editorSlice';

export const store = configureStore({ reducer: { editor } });

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();

const toaster = {
  success: (message: string, description?: string) => toast.success(message, { description }),
  error: (message: string, description?: string) => toast.error(message, { description }),
};

/** Same API as before, now rendered by Sonner. An optional second argument adds a description. */
export function useToast() {
  return toaster;
}
