import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Раздеватор — AI-фото 18+",
    short_name: "Раздеватор",
    description:
      "Приватный AI-сервис: превращаем ваши фото в 18+ кадры. Только для совершеннолетних.",
    start_url: "/",
    display: "standalone",
    background_color: "#0a090b",
    theme_color: "#0a090b",
    icons: [
      {
        src: "/android-chrome-192x192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/android-chrome-512x512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
