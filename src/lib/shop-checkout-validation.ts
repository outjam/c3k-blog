import type { CheckoutFormValues } from "@/types/shop";

export interface CheckoutValidationErrors {
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  comment?: string;
}

const getDigits = (value: string): string => value.replace(/\D/g, "");

const isEmailValid = (value: string): boolean => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(value);
};

const isNameValid = (value: string): boolean => {
  return /^[\p{L}\s-]{2,}$/u.test(value);
};

export const validateCheckoutForm = (values: CheckoutFormValues): CheckoutValidationErrors => {
  const errors: CheckoutValidationErrors = {};
  const firstName = values.firstName.trim();
  const lastName = values.lastName.trim();
  const phone = values.phone.trim();
  const email = values.email.trim();
  const comment = values.comment.trim();

  if (!firstName) {
    errors.firstName = "Введите имя";
  } else if (!isNameValid(firstName)) {
    errors.firstName = "Имя должно содержать минимум 2 буквы";
  }

  if (!lastName) {
    errors.lastName = "Введите фамилию";
  } else if (!isNameValid(lastName)) {
    errors.lastName = "Фамилия должна содержать минимум 2 буквы";
  }

  if (!phone) {
    errors.phone = "Введите номер телефона";
  } else {
    const digits = getDigits(phone);
    const looksLikePhone = /^\+?[0-9()\s-]{7,20}$/.test(phone);

    if (!looksLikePhone || digits.length < 7 || digits.length > 15) {
      errors.phone = "Проверьте формат телефона";
    }
  }

  if (email && !isEmailValid(email)) {
    errors.email = "Проверьте e-mail";
  }

  if (comment.length > 300) {
    errors.comment = "Комментарий не должен превышать 300 символов";
  }

  return errors;
};

export const hasCheckoutErrors = (errors: CheckoutValidationErrors): boolean => {
  return Boolean(errors.firstName || errors.lastName || errors.phone || errors.email || errors.comment);
};
