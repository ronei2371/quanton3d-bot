import * as Sentry from "@sentry/node";

export function notifyBootstrapError(error, context) {
  const payload = {
    context,
    message: error?.message,
    stack: error?.stack
  };

  if (Sentry.getCurrentHub().getClient()) {
    Sentry.captureException(error, {
      tags: { phase: "bootstrap", context }
    });
  } else {
    console.error("[notify] Erro no bootstrap:", payload);
  }
}
