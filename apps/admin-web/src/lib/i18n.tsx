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
  navArchive: "Video arxiv",
  navLogout: "Chiqish",
  navMenu: "Menyu",
  navClose: "Yopish",

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
  deviceCameraFront: "Oldi",
  deviceCameraBack: "Orqa",
  deviceCameraBusy: "Kamera…",
  deviceCameraError: "Kamera almashtirilmadi",
  deviceCameraHint: "Telefon 2–5 soniyada kamerani almashtiradi",

  videoConnecting: "Stream ulanmoqda…",
  videoIdle: "Tomosha qilinmayapti",
  videoWhepError: "WHEP xatosi",
  videoStreamFailed: "Stream ulanmadi",
  videoWaitingPublisher: "Telefon efirga qayta ulanmoqda…",

  cardBranchRoom: "Filial / xona",
  cardCharging: "zaryadlanmoqda",
  cardLastSeen: "Oxirgi ko‘rinish",
  cardWatchLive: "Jonli ko‘rish",

  statusONLINE: "ONLAYN",
  statusOFFLINE: "OFLAYN",
  statusCONNECTING: "ULANMOQDA",
  statusSTREAMING: "EFIRDA",
  statusERROR: "XATO",

  archiveTitle: "Video arxiv",
  archiveSubtitle: "Yozuvlar, timeline va playback",
  archiveAllDevices: "Barcha qurilmalar",
  archiveAllCameras: "Barcha kameralar",
  archiveToday: "Bugun",
  archiveYesterday: "Kecha",
  archiveLast7: "Oxirgi 7 kun",
  archiveLast30: "Oxirgi 30 kun",
  archiveCustom: "Custom",
  archiveFrom: "Dan",
  archiveTo: "Gacha",
  archiveSearch: "Qidirish",
  archiveEmpty: "Shu filtrda yozuv yo‘q",
  archivePlay: "Play",
  archivePause: "Pause",
  archiveSpeed: "Tezlik",
  archiveDownload: "Yuklab olish",
  archiveDownloadRange: "Oralig‘ni ZIP qilish",
  archiveDelete: "O‘chirish",
  archiveDeleteSelected: "Tanlanganlarni o‘chirish",
  archiveDeleteRange: "Oralig‘ni o‘chirish",
  archiveDeleteAll: "Hammasini o‘chirish",
  archiveConfirmDelete: "Yozuv(lar) o‘chirilsinmi? Bu amalni qaytarib bo‘lmaydi.",
  archiveCancel: "Bekor qilish",
  archiveStorage: "Storage",
  archiveRecordingSize: "Yozuvlar",
  archiveFree: "Bo‘sh",
  archiveRetention: "Saqlash muddati",
  archiveDays: "kun",
  archiveAutoCleanup: "Avto tozalash",
  archiveOn: "Yoqilgan",
  archiveOff: "O‘chiq",
  archiveStatusRECORDING: "YOZILMOQDA",
  archiveStatusPROCESSING: "TAYYORLANMOQDA",
  archiveStatusREADY: "TAYYOR",
  archiveStatusFAILED: "XATO",
  archiveStatusDELETED: "O‘CHIRILGAN",
  archiveGap: "Bo‘sh",
  archiveSelect: "Tanlash",
  archiveNoPlayer: "Playback uchun yozuvni tanlang",
  archiveLoadError: "Arxiv yuklanmadi",
} as const;

const ru: { [K in keyof typeof uz]: string } = {
  langUz: "Oʻz",
  langRu: "Ру",
  langSwitch: "Сменить язык",
  loading: "Загрузка…",

  navDevices: "Устройства",
  navArchive: "Видеоархив",
  navLogout: "Выйти",
  navMenu: "Меню",
  navClose: "Закрыть",

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
  deviceCameraFront: "Передняя",
  deviceCameraBack: "Задняя",
  deviceCameraBusy: "Камера…",
  deviceCameraError: "Не удалось сменить камеру",
  deviceCameraHint: "Телефон сменит камеру за 2–5 секунд",

  videoConnecting: "Подключение к эфиру…",
  videoIdle: "Просмотр не начат",
  videoWhepError: "Ошибка WHEP",
  videoStreamFailed: "Не удалось подключить эфир",
  videoWaitingPublisher: "Телефон снова выходит в эфир…",

  cardBranchRoom: "Филиал / комната",
  cardCharging: "заряжается",
  cardLastSeen: "Последняя активность",
  cardWatchLive: "Смотреть эфир",

  statusONLINE: "ОНЛАЙН",
  statusOFFLINE: "ОФЛАЙН",
  statusCONNECTING: "ПОДКЛЮЧЕНИЕ",
  statusSTREAMING: "ЭФИР",
  statusERROR: "ОШИБКА",

  archiveTitle: "Видеоархив",
  archiveSubtitle: "Записи, таймлайн и воспроизведение",
  archiveAllDevices: "Все устройства",
  archiveAllCameras: "Все камеры",
  archiveToday: "Сегодня",
  archiveYesterday: "Вчера",
  archiveLast7: "Последние 7 дней",
  archiveLast30: "Последние 30 дней",
  archiveCustom: "Свой период",
  archiveFrom: "С",
  archiveTo: "До",
  archiveSearch: "Поиск",
  archiveEmpty: "По этому фильтру записей нет",
  archivePlay: "Play",
  archivePause: "Pause",
  archiveSpeed: "Скорость",
  archiveDownload: "Скачать",
  archiveDownloadRange: "Скачать ZIP за период",
  archiveDelete: "Удалить",
  archiveDeleteSelected: "Удалить выбранные",
  archiveDeleteRange: "Удалить период",
  archiveDeleteAll: "Удалить все",
  archiveConfirmDelete: "Удалить запись(и)? Это действие нельзя отменить.",
  archiveCancel: "Отмена",
  archiveStorage: "Storage",
  archiveRecordingSize: "Записи",
  archiveFree: "Свободно",
  archiveRetention: "Срок хранения",
  archiveDays: "дн.",
  archiveAutoCleanup: "Автоочистка",
  archiveOn: "Вкл",
  archiveOff: "Выкл",
  archiveStatusRECORDING: "ЗАПИСЬ",
  archiveStatusPROCESSING: "ОБРАБОТКА",
  archiveStatusREADY: "ГОТОВО",
  archiveStatusFAILED: "ОШИБКА",
  archiveStatusDELETED: "УДАЛЕНО",
  archiveGap: "Пауза",
  archiveSelect: "Выбрать",
  archiveNoPlayer: "Выберите запись для воспроизведения",
  archiveLoadError: "Не удалось загрузить архив",
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
