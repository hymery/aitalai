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
      allowedHosts: [
        ".loca.lt",
        ".lhr.life",
        ".trycloudflare.com",
        ".serveousercontent.com",
        ".tuna.am",
        ".tuna.free",
      ],
    },
    preview: {
      host: "0.0.0.0",
      port: 5174,
      allowedHosts: [".serveousercontent.com", ".tuna.am", ".tuna.free"],
      proxy: {
        "/api": {
          target: "http://localhost:8000",
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ""),
        },
      },
    },
  };
});
