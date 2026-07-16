import { useDispatch, useSelector } from 'react-redux';
import type { RootState, AppDispatch } from './store';

// Typed hooks pour utiliser Redux dans les composants
export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();

