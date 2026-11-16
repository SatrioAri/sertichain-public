import { config } from "./config.js";
import { createApp } from "./app.js";

createApp().listen(config.PORT, () => {
  console.log(`Backend SertiChain berjalan di http://localhost:${config.PORT}`);
});
