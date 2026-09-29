export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startCashxWorker } = await import("./lib/cashx");
    startCashxWorker();
  }
}
