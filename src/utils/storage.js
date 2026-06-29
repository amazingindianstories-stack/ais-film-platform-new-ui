import fs from 'fs/promises';
import path from 'path';

const STORAGE_ROOT = path.join(process.cwd(), 'public', 'uploads');

export const storage = {
  from: (bucket) => ({
    upload: async (filepath, buffer, options = {}) => {
      try {
        const fullPath = path.join(STORAGE_ROOT, bucket, filepath);
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, buffer);
        return { data: { path: filepath }, error: null };
      } catch (error) {
        console.error("Storage upload error:", error);
        return { data: null, error };
      }
    },
    getPublicUrl: (filepath) => {
      // Assuming 'public/uploads' is served at '/uploads'
      return { data: { publicUrl: `/uploads/${bucket}/${filepath}` } };
    },
    remove: async (filepaths) => {
      try {
        for (const filepath of filepaths) {
          const fullPath = path.join(STORAGE_ROOT, bucket, filepath);
          await fs.unlink(fullPath).catch(() => {}); // ignore if doesn't exist
        }
        return { data: filepaths, error: null };
      } catch (error) {
        console.error("Storage remove error:", error);
        return { data: null, error };
      }
    },
    list: async (prefix) => {
      try {
        const dirPath = path.join(STORAGE_ROOT, bucket, prefix || '');
        const files = await fs.readdir(dirPath, { withFileTypes: true });
        const data = files.map(f => ({ name: f.name, id: f.name }));
        return { data, error: null };
      } catch (error) {
        // Return empty array if directory doesn't exist yet
        return { data: [], error: null };
      }
    }
  })
};
