/* eslint-disable react/prop-types */
import { toast } from "react-toastify";
import dayjs from "dayjs";
import i18next from "i18next";
import "./display-toast.scss";

/** @param {string} text The toast display text */
export function displaySuccess(text) {
  const displayText = `${text} ${dayjs().format("HH:mm:ss")}`;

  toast.success(displayText);
}

/** @param {string} text The toast display text */
export function displayWarning(text) {
  const displayText = `${text} ${dayjs().format("HH:mm:ss")}`;

  toast.warning(displayText);
}

/**
 * @param {string} errorString - The toast display text
 * @param {object} error - The error
 */
export function displayError(errorString, error) {
  let errorText = "";

  if (error && error["hydra:description"]) {
    errorText = error["hydra:description"];
  }
  if (error?.data && typeof error.data === "object") {
    errorText = error.data["hydra:description"] || error.data.message || "";
  }
  // A 413 means the body was rejected for its size — either by nginx before
  // Symfony was reached (RTK Query then hands us a PARSING_ERROR on the HTML
  // error page) or by MediaController on a post_max_size overflow. Neither the
  // raw status nor the "Unexpected token '<'" SyntaxError tells an editor what
  // to do about it.
  if (!errorText && (error?.status === 413 || error?.originalStatus === 413)) {
    errorText = i18next.t("common:error-messages.upload-too-large");
  }
  if (!errorText && error?.status === "PARSING_ERROR") {
    errorText = i18next.t("common:error-messages.unexpected-server-response");
    if (error.originalStatus) {
      errorText = `${errorText} (${error.originalStatus})`;
    }
  }
  if (!errorText && error?.error) {
    errorText = error.error;
  }

  const displayText = `${errorString} ${errorText} ${dayjs().format(
    "HH:mm:ss",
  )}`;

  toast.error(displayText, {
    autoClose: false,
  });
}
