"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Locale = "uz" | "ru";

const STORAGE_KEY = "monitor.locale";

const uz = {
  langUz: "Oʻz",
  langRu: "Ру",
  langSwitch: "Tilni o‘zgartirish",
  loading: "Yuklanmoqda…",

  navDevices: "Qurilmalar",
  navLogout: "Chiqish",

  loginSubtitle: "Admin paneliga kirish",
  loginEmail: "Email",
  loginPassword: "Parol",
  loginSubmit: "Kirish",
  loginSubmitting: "Kirilmoqda…",
  loginFailed: "Kirish amalga oshmadi",

  devicesTitle: "Kuzatuv qurilmalari",
  devicesSubtitle: "Qurilmalar holati real vaqtda yangilanadi",
  devicesPairing: "Juftlash kodi",
  devicesLoadError: "Qurilmalar yuklanmadi",
  devicesEmpty:
    "Hali qurilma yo‘q. Juftlash kodi yaratib, Android qurilmani ulang.",

  pairingTitle: "Juftlash kodi",
  pairingClose: "Yopish",
  pairingEnterCode: "Qurilmada ushbu kodni kiriting:",
  pairingHint: "Bu kod muddatsiz — bir marta ulangach doimiy amal qiladi.",
  pairingReady: "Tayyor",
  pairingBranch: "Filial",
  pairingSelectBranch: "Filial tanlang",
  pairingCreate: "Kod yaratish",
  pairingCreating: "Yaratilmoqda…",
  pairingBranchesError: "Filiallar yuklanmadi",
  pairingCreateError: "Kod yaratilmadi",

  deviceBack: "← Qurilmalarga qaytish",
  deviceNotFound: "Qurilma topilmadi",
  deviceBattery: "Batareya",
  deviceNetwork: "Tarmoq",
  deviceLastSeen: "Oxirgi",
  deviceStopWatching: "Tomoshani to‘xtatish",
  deviceWatchLive: "Jonli efirni ko‘rish",
  deviceUnmute: "Ovozni yoqish",
  deviceMute: "Ovozni o‘chirish",
  deviceFullscreen: "To‘liq ekran",
  deviceSnapshot: "Snapshot",
  deviceSnapshotBusy: "Snapshot…",
  deviceQuality: "Sifat",
  deviceVideoNotReady: "Video hali tayyor emas",
  deviceCanvasUnavailable: "Canvas mavjud emas",
  deviceSnapshotSaved: "Snapshot saqlandi",
  deviceSnapshotError: "Snapshot xatosi",

  videoConnecting: "Stream ulanmoqda…",
  videoIdle: "Tomosha qilinmayapti",
  videoWhepError: "WHEP xatosi",
  videoStreamFailed: "Stream ulanmadi",

  cardBranchRoom: "Filial / xona",
  cardCharging: "zaryadlanmoqda",
  cardLastSeen: "Oxirgi ko‘rinish",
  cardWatchLive: "Jonli ko‘rish",

  statusONLINE: "ONLAYN",
  statusOFFLINE: "OFLAYN",
  statusCONNECTING: "ULANMOQDA",
  statusSTREAMING: "EFIRDA",
  statusERROR: "XATO",
} as const;

const ru: { [K in keyof typeof uz]: string } = {
  langUz: "Oʻz",
  langRu: "Ру",
  langSwitch: "Сменить язык",
  loading: "Загрузка…",

  navDevices: "Устройства",
  navLogout: "Выйти",

  loginSubtitle: "Вход в админ-панель",
  loginEmail: "Email",
  loginPassword: "Пароль",
  loginSubmit: "Войти",
  loginSubmitting: "Вход…",
  loginFailed: "Не удалось войти",

  devicesTitle: "Устройства наблюдения",
  devicesSubtitle: "Статус устройств обновляется в реальном времени",
  devicesPairing: "Код привязки",
  devicesLoadError: "Не удалось загрузить устройства",
  devicesEmpty:
    "Пока нет устройств. Создайте код привязки и подключите Android-устройство.",

  pairingTitle: "Код привязки",
  pairingClose: "Закрыть",
  pairingEnterCode: "Введите этот код на устройстве:",
  pairingHint: "Код бессрочный — после одного подключения действует постоянно.",
  pairingReady: "Готово",
  pairingBranch: "Филиал",
  pairingSelectBranch: "Выберите филиал",
  pairingCreate: "Создать код",
  pairingCreating: "Создание…",
  pairingBranchesError: "Не удалось загрузить филиалы",
  pairingCreateError: "Не удалось создать код",

  deviceBack: "← Назад к устройствам",
  deviceNotFound: "Устройство не найдено",
  deviceBattery: "Батарея",
  deviceNetwork: "Сеть",
  deviceLastSeen: "Последний раз",
  deviceStopWatching: "Остановить просмотр",
  deviceWatchLive: "Смотреть эфир",
  deviceUnmute: "Включить звук",
  deviceMute: "Выключить звук",
  deviceFullscreen: "На весь экран",
  deviceSnapshot: "Снимок",
  deviceSnapshotBusy: "Снимок…",
  deviceQuality: "Качество",
  deviceVideoNotReady: "Видео ещё не готово",
  deviceCanvasUnavailable: "Canvas недоступен",
  deviceSnapshotSaved: "Снимок сохранён",
  deviceSnapshotError: "Ошибка снимка",

  videoConnecting: "Подключение к эфиру…",
  videoIdle: "Просмотр не начат",
  videoWhepError: "Ошибка WHEP",
  videoStreamFailed: "Не удалось подключить эфир",

  cardBranchRoom: "Филиал / комната",
  cardCharging: "заряжается",
  cardLastSeen: "Последняя активность",
  cardWatchLive: "Смотреть эфир",

  statusONLINE: "ОНЛАЙН",
  statusOFFLINE: "ОФЛАЙН",
  statusCONNECTING: "ПОДКЛЮЧЕНИЕ",
  statusSTREAMING: "ЭФИР",
  statusERROR: "ОШИБКА",
};

const dictionaries = { uz, ru } as const;

export type MessageKey = keyof typeof uz;

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function readStoredLocale(): Locale {
  if (typeof window === "undefined") return "uz";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === "ru" || stored === "uz" ? stored : "uz";
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("uz");

  useEffect(() => {
    setLocaleState(readStoredLocale());
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  }, []);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale,
      t: (key) => dictionaries[locale][key],
    }),
    [locale, setLocale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useI18n must be used within LanguageProvider");
  }
  return ctx;
}

export function localeTag(locale: Locale) {
  return locale === "ru" ? "ru-RU" : "uz-UZ";
}
