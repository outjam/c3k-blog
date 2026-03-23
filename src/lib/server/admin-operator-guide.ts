import { readAdminDeploymentReadiness } from "@/lib/server/admin-deployment-readiness";
import { readAdminIncidentStatus } from "@/lib/server/admin-incident-status";
import { readAdminMigrationStatus } from "@/lib/server/migration-status";
import { readAdminTonEnvironmentStatus } from "@/lib/server/admin-ton-environment-status";
import type {
  AdminOperatorGuideAction,
  AdminOperatorGuideSnapshot,
  AdminOperatorGuideState,
  AdminOperatorReleaseMode,
  AdminOperatorRunbook,
} from "@/types/admin";

const MAX_ACTIONS = 6;

const resolveOverallState = (input: {
  criticalIncidents: number;
  missingChecks: number;
  warningChecks: number;
  migrationOverallState: "legacy_only" | "dual_write" | "ready";
  tonWarnings: number;
}): AdminOperatorGuideState => {
  if (input.criticalIncidents > 0 || input.missingChecks > 0) {
    return "blocked";
  }

  if (input.warningChecks > 0 || input.tonWarnings > 0 || input.migrationOverallState !== "ready") {
    return "caution";
  }

  return "ready";
};

const resolveReleaseMode = (input: {
  network: "mainnet" | "testnet";
  overallState: AdminOperatorGuideState;
  relayReady: boolean;
  tonWarnings: number;
  onchainMintEnabled: boolean;
  migrationOverallState: "legacy_only" | "dual_write" | "ready";
}): AdminOperatorReleaseMode => {
  if (input.network === "testnet") {
    return "test_only";
  }

  if (
    input.overallState === "ready" &&
    input.relayReady &&
    input.tonWarnings === 0 &&
    input.onchainMintEnabled &&
    input.migrationOverallState === "ready"
  ) {
    return "mainnet_ready";
  }

  return "mainnet_blocked";
};

const pushAction = (
  actions: AdminOperatorGuideAction[],
  action: AdminOperatorGuideAction,
): void => {
  if (actions.some((entry) => entry.id === action.id)) {
    return;
  }

  actions.push(action);
};

const buildRunbooks = (): AdminOperatorRunbook[] => {
  return [
    {
      id: "after_deploy",
      label: "После деплоя",
      when: "Когда выкатываешь новый backend slice или меняешь env в Vercel.",
      steps: [
        "Открой Deployment readiness и проверь, что missing checks не осталось.",
        "Сверь TON environment: активная сеть, collection source и relay readiness.",
        "Проверь Incident overview: нет ли новых критичных delivery, payout или NFT runtime сигналов.",
        "Если очереди зависли, вручную прогоняй нужный worker и смотри новый run в истории.",
      ],
    },
    {
      id: "delivery_recovery",
      label: "Если застряла доставка файлов",
      when: "Когда storage delivery или Telegram notifications перестали опустошать очередь.",
      steps: [
        "Посмотри Incident overview и историю worker runs, чтобы понять, какой worker деградировал.",
        "Запусти manual recovery из Dashboard для нужной очереди.",
        "Сверь queue metrics в новом run: processed, failed, remaining.",
        "Если remaining не падает, проверь worker secrets, Telegram env и storage delivery status.",
      ],
    },
    {
      id: "ton_network_guard",
      label: "Если есть drift по TON сети",
      when: "Когда runtime collection и активная сеть не совпадают или relay не готов.",
      steps: [
        "Сверь active network и runtime config в блоке TON environment.",
        "Не запускай deploy/mint, пока runtime не относится к активной сети.",
        "Если сейчас testnet, держи release mode в test-only до полного preflight.",
        "Перед mainnet выровняй env collection, sponsor wallet и public metadata URL.",
      ],
    },
    {
      id: "mainnet_go_live",
      label: "Перед mainnet go-live",
      when: "Когда хочешь выйти из test-only режима и открыть боевой TON contour.",
      steps: [
        "Все migration domains должны быть в ready или иметь понятный cutover plan без критичных drift-рисков.",
        "Deployment readiness не должен содержать missing checks.",
        "TON environment должен быть clean: mainnet, relay ready, без warnings.",
        "После включения mainnet ещё раз прогони post-deploy check и worker recovery check.",
      ],
    },
  ];
};

export const readAdminOperatorGuide = async (request: Request): Promise<AdminOperatorGuideSnapshot> => {
  const [incidentStatus, deploymentReadiness, tonStatus, migrationStatus] = await Promise.all([
    readAdminIncidentStatus(),
    readAdminDeploymentReadiness(request),
    readAdminTonEnvironmentStatus(request),
    readAdminMigrationStatus(),
  ]);

  const overallState = resolveOverallState({
    criticalIncidents: incidentStatus.criticalIncidents,
    missingChecks: deploymentReadiness.missingChecks,
    warningChecks: deploymentReadiness.warningChecks,
    migrationOverallState: migrationStatus.overallState,
    tonWarnings: tonStatus.warnings.length,
  });

  const releaseMode = resolveReleaseMode({
    network: tonStatus.network,
    overallState,
    relayReady: tonStatus.relayReady,
    tonWarnings: tonStatus.warnings.length,
    onchainMintEnabled: tonStatus.onchainMintEnabled,
    migrationOverallState: migrationStatus.overallState,
  });

  const actions: AdminOperatorGuideAction[] = [];

  if (incidentStatus.criticalIncidents > 0) {
    pushAction(actions, {
      id: "critical_incidents",
      priority: "critical",
      title: "Разобрать критичные инциденты",
      description:
        "Сейчас есть критичные operational сигналы. Сначала стабилизируй deliveries, payouts или TON runtime, а уже потом продолжай rollout.",
    });
  }

  if (deploymentReadiness.missingChecks > 0) {
    pushAction(actions, {
      id: "missing_deploy_checks",
      priority: "critical",
      title: "Закрыть missing deployment checks",
      description:
        "В deployment readiness остались обязательные пробелы по env или infra. Без этого контур нельзя считать production-ready.",
    });
  }

  if (migrationStatus.overallState !== "ready") {
    pushAction(actions, {
      id: "migration_cutover",
      priority: "high",
      title: "Дожать cutover доменов",
      description:
        "Часть критичных доменов ещё в dual-write или legacy_only. Перед mainnet это нужно либо закрыть, либо принять как осознанный риск.",
    });
  }

  if (tonStatus.warnings.length > 0 || !tonStatus.relayReady) {
    pushAction(actions, {
      id: "ton_guardrails",
      priority: tonStatus.network === "mainnet" ? "critical" : "high",
      title: "Выровнять TON environment",
      description:
        "Есть drift по сети, collection source или relay env. Пока он не закрыт, mint/deploy должны оставаться под ручным контролем.",
    });
  }

  if (releaseMode === "test_only") {
    pushAction(actions, {
      id: "stay_test_only",
      priority: "normal",
      title: "Оставаться в test-only режиме",
      description:
        "Сейчас активна testnet. Это нормально: используй runbooks, admin preflight и worker recovery, не открывая mainnet contour раньше времени.",
    });
  }

  if (deploymentReadiness.warningChecks > 0 && deploymentReadiness.missingChecks === 0) {
    pushAction(actions, {
      id: "clear_warnings",
      priority: "normal",
      title: "Почистить предупреждения preflight",
      description:
        "Система уже близка к стабильному rollout, но лучше закрыть warning checks до выхода на живую аудиторию.",
    });
  }

  const summary =
    releaseMode === "mainnet_ready"
      ? "Mainnet contour выглядит согласованным: критичных инцидентов и missing preflight checks нет."
      : releaseMode === "mainnet_blocked"
        ? "Mainnet режим пока заблокирован: сначала нужно закрыть preflight, cutover и TON warnings."
        : "Система работает в test-only режиме. Используй этот слой как operator cockpit перед выходом на боевой contour.";

  return {
    updatedAt: new Date().toISOString(),
    overallState,
    releaseMode,
    summary,
    nextActions: actions.slice(0, MAX_ACTIONS),
    runbooks: buildRunbooks(),
  };
};
