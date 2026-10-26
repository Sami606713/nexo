import { notifications } from "@mantine/notifications";

export const notifySuccess = (message: string, title?: string) => notifications.show({ color: "teal", title, message });

export const notifyError = (err: unknown, fallback = "Something went wrong") =>
  notifications.show({ color: "red", title: "Error", message: err instanceof Error && err.message ? err.message : fallback });
