export const db = new Dexie('SketchAppDatabase');

db.version(1).stores({
  sketches: '++id, &name, savedAt' // Primary key, unique index on name, regular index on savedAt
});