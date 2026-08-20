"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Locale = "en" | "ru";

const dict = {
  en: {
    appName: "LevelApp",
    chats: "Chats",
    settings: "Settings",
    profile: "Profile",
    login: "Sign in",
    logout: "Log out",
    phone: "Phone",
    password: "PIN",
    name: "Name",
    inviteCode: "Invite code (optional)",
    continue: "Continue",
    search: "Search",
    emptyChats: "No chats yet",
    emptyChatsHint: "Link a device or wait for messages",
    typeMessage: "Message",
    send: "Send",
    linkedDevices: "Linked devices",
    generateCode: "Generate link code",
    enterCode: "Enter link code",
    watchLive: "Watch live",
    unlink: "Unlink",
    subscription: "Subscription",
    pro: "Pro",
    proPlus: "Pro+",
    payCard: "Pay with card",
    payCrypto: "Pay with crypto",
    callCenter: "Call Center",
    editName: "Edit name",
    editPhone: "Edit phone",
    changePin: "Change PIN",
    save: "Save",
    cancel: "Cancel",
    confirm: "Confirm",
    loading: "Loading…",
    offline: "Offline",
    online: "Online",
    theme: "Theme",
    language: "Language",
    light: "Light",
    dark: "Dark",
    system: "System",
    sessionReplaced: "Signed in on another device",
    newUserHint: "Create your account",
    returningHint: "Welcome back",
    copy: "Copy",
    copied: "Copied",
    noDevices: "No linked devices",
    trialHint: "24h trial live video on first link",
    switchCamera: "Switch camera",
    back: "Back",
    attach: "Attach",
    delete: "Delete",
    edit: "Edit",
    reply: "Reply",
    supportUnread: "Support",
  },
  ru: {
    appName: "LevelApp",
    chats: "Чаты",
    settings: "Настройки",
    profile: "Профиль",
    login: "Войти",
    logout: "Выйти",
    phone: "Телефон",
    password: "PIN",
    name: "Имя",
    inviteCode: "Код приглашения (необяз.)",
    continue: "Продолжить",
    search: "Поиск",
    emptyChats: "Пока нет чатов",
    emptyChatsHint: "Привяжите устройство или дождитесь сообщений",
    typeMessage: "Сообщение",
    send: "Отправить",
    linkedDevices: "Связанные устройства",
    generateCode: "Создать код",
    enterCode: "Ввести код",
    watchLive: "Смотреть эфир",
    unlink: "Отвязать",
    subscription: "Подписка",
    pro: "Pro",
    proPlus: "Pro+",
    payCard: "Оплатить картой",
    payCrypto: "Крипто",
    callCenter: "Колл-центр",
    editName: "Изменить имя",
    editPhone: "Изменить телефон",
    changePin: "Сменить PIN",
    save: "Сохранить",
    cancel: "Отмена",
    confirm: "Подтвердить",
    loading: "Загрузка…",
    offline: "Не в сети",
    online: "В сети",
    theme: "Тема",
    language: "Язык",
    light: "Светлая",
    dark: "Тёмная",
    system: "Система",
    sessionReplaced: "Вход с другого устройства",
    newUserHint: "Создайте аккаунт",
    returningHint: "С возвращением",
    copy: "Копировать",
    copied: "Скопировано",
    noDevices: "Нет связанных устройств",
    trialHint: "24ч пробного видео при первой привязке",
    switchCamera: "Камера",
    back: "Назад",
    attach: "Файл",
    delete: "Удалить",
    edit: "Изменить",
    reply: "Ответить",
    supportUnread: "Поддержка",
  },
} as const;

export type MsgKey = keyof typeof dict.en;

type I18nCtx = {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: MsgKey) => string;
};

const I18nContext = createContext<I18nCtx | null>(null);
const LOCALE_KEY = "levelapp.locale";

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    if (typeof window === "undefined") return "en";
    const stored = localStorage.getItem(LOCALE_KEY);
    return stored === "ru" ? "ru" : "en";
  });

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    localStorage.setItem(LOCALE_KEY, l);
  }, []);

  const t = useCallback(
    (key: MsgKey) => dict[locale][key] ?? dict.en[key],
    [locale],
  );

  const value = useMemo(
    () => ({ locale, setLocale, t }),
    [locale, setLocale, t],
  );

  return (
    <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n outside provider");
  return ctx;
}
