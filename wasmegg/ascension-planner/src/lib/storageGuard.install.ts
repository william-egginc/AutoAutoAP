// Imported first by main.ts, before any module that reads storage while loading (storageGuard.ts).
import { installStorageGuard } from './storageGuard';
import { watchStorageWrites } from './storageWrites';

installStorageGuard();
// Then: a failed write is noted, so App.vue can say what was set may not survive a reload (storageWrites.ts).
watchStorageWrites();
