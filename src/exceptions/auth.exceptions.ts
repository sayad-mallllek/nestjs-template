import { BadRequestException } from '@nestjs/common';

import { getConfirmPasswordExceptionGeneralErrorMessage } from '@/utils/functions/auth.functions';
import { i18nValidationMessage } from 'nestjs-i18n';
import { I18nTranslations } from '../generated/i18n.generated';
export class DuplicateEmailException extends BadRequestException {
  constructor() {
    super('A user associated with this email already exists');
  }
}

export class SignupUserException extends BadRequestException {
  constructor(message?: string) {
    super('An error Occurred while signing up the user', {
      description: message,
    });
  }
}

export class LoginUserException extends BadRequestException {
  constructor(message?: string) {
    super(
      i18nValidationMessage<I18nTranslations>(
        'auth.errors.incorrect-email-or-password',
      ),
      {
        description: message,
      },
    );
  }
}

export class UserNotConfirmedException extends BadRequestException {
  constructor(message?: string) {
    super('User is not confirmed', {
      description: message,
    });
  }
}

export class InvalidUpdateUserException extends BadRequestException {
  constructor(message?: string) {
    super('An error Occurred while updating the user', {
      description: message,
    });
  }
}

export class ResendConfirmationCodeException extends BadRequestException {
  constructor(message?: string) {
    super('An error Occurred while resending the confirmation code', {
      description: message,
    });
  }
}

export class ConfirmForgotPasswordException extends BadRequestException {
  constructor(name: string, message?: string) {
    super(getConfirmPasswordExceptionGeneralErrorMessage(name), {
      description: message,
    });
  }
}

export class ConfirmSignupException extends BadRequestException {
  constructor(message?: string) {
    super('An error Occurred while confirming the user', {
      description: message,
    });
  }
}
