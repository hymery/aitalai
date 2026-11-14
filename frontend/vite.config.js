import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    define: {
      __AITALAI_API_URL__: JSON.stringify(
        env.VITE_API_URL || "http://localhost:8000"
      ),
    },
    server: {
      host: "0.0.0.0",
      port: 5173,
    },
  };
});
