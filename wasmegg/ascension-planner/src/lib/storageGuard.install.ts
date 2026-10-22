// Imported first by main.ts, before any module that reads storage while loading (storageGuard.ts).
import { installStorageGuard } from './storageGuard';

installStorageGuard();
