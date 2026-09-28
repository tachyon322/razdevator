/**
 * Хук резолвинга для `node --test`. Node ESM требует явные расширения, а проект
 * использует импорты без них (`./db`). При неудаче пробуем `.ts` и `index.ts`,
 * чтобы тесты подключали серверные модули напрямую, без сборки.
 */
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (specifier.startsWith(".") || specifier.startsWith("/")) {
        for (const suffix of [".ts", "/index.ts"]) {
          try {
            return nextResolve(specifier + suffix, context);
          } catch {
            // пробуем следующий вариант
          }
        }
      }
      throw error;
    }
  },
});
