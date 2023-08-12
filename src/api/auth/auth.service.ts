import {
  AssociateSoftwareTokenCommand,
  AuthFlowType,
  ChallengeNameType,
  CognitoIdentityProviderClient,
  ConfirmForgotPasswordCommand,
  ConfirmSignUpCommand,
  ForgotPasswordCommand,
  InitiateAuthCommand,
  InitiateAuthCommandOutput,
  ResendConfirmationCodeCommand,
  RespondToAuthChallengeCommand,
  SignUpCommand,
  VerifySoftwareTokenCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { HttpService } from '@nestjs/axios';
import {
  BadRequestException,
  Injectable,
  OnModuleDestroy,
} from '@nestjs/common';
import { UserRegistrationStepEnum } from '@prisma/client';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const qs = require('qs');

import { PrismaService } from 'src/api/prisma/prisma.service';
import {
  ConfirmForgotPasswordException,
  DuplicateEmailException,
  InvalidUpdateUserException,
  LoginUserException,
  ResendConfirmationCodeException,
  SetupMFAException,
} from 'src/exceptions/auth.exceptions';

import { ConfirmLoginInput } from './dto/confirm-login.dto';
import { ConfirmSignupInput } from './dto/confirm-signup.dto';
import { EmailOnlyInput } from './dto/email-only.dto';
import { LoginInput } from './dto/login.dto';
import { ResetPasswordInput } from './dto/reset-passowrd.dto';
import { SetupMFAInput } from './dto/setup-mfa.dto';
import { SignupInput } from './dto/signup.dto';



type AxiosResponse<T> = {
  data: T;
  status: number;
};

@Injectable()
export class AuthService implements OnModuleDestroy {
  private readonly client: CognitoIdentityProviderClient;
  private readonly clientId: string;
  private readonly domain: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly httpService: HttpService,
  ) {
    this.client = new CognitoIdentityProviderClient({
      credentials: {
        accessKeyId: process.env.COGNITO_ACCESS_KEY_ID,
        secretAccessKey: process.env.COGNITO_SECRET_ACCESS_KEY,
      },
      region: process.env.COGNITO_REGION,
    });
    this.clientId = process.env.COGNITO_CLIENT_ID;
    this.domain = process.env.COGNITO_DOMAIN;
  }

  onModuleDestroy() {
    this.client.destroy();
  }

  private async _checkIfEmailExists(email: string) {
    const emailCount = await this.prisma.user.count({
      where: {
        email,
      },
    });

    return emailCount > 0;
  }

  private _sendCreateNewUserCommand(input: SignupInput) {
    const command = new SignUpCommand({
      ClientId: this.clientId,
      Username: input.email,
      Password: input.password,
    });

    return this.client.send(command);
  }

  private async _createNewUser(input: SignupInput) {
    const resp = await this._sendCreateNewUserCommand(input);

    await this.prisma.user.create({
      data: {
        email: input.email,
        registrationStep: resp.UserConfirmed
          ? UserRegistrationStepEnum.PENDING_CONFIRMATION
          : UserRegistrationStepEnum.DONE,
        sub: resp.UserSub,
      },
    });
  }

  private _sendConfirmUserSignupCommand(input: ConfirmSignupInput) {
    const command = new ConfirmSignUpCommand({
      ClientId: this.clientId,
      Username: input.email,
      ConfirmationCode: input.code,
    });

    return this.client.send(command);
  }

  private _updateUserAfterSignupConfirmation(email: string) {
    return this.prisma.user.update({
      where: {
        email,
      },
      data: {
        registrationStep: UserRegistrationStepEnum.DONE,
      },
    });
  }

  private _sendLoginCommand(input: LoginInput) {
    const command = new InitiateAuthCommand({
      AuthFlow: AuthFlowType.USER_PASSWORD_AUTH,
      ClientId: this.clientId,
      AuthParameters: {
        USERNAME: input.email,
        PASSWORD: input.password,
      },
    });

    return this.client.send(command);
  }

  private _sendSetupMFACommand(session: string) {
    const softwareCommand = new AssociateSoftwareTokenCommand({
      Session: session,
    });

    return this.client.send(softwareCommand);
  }

  private async _handleLoginCommandResponse(resp: InitiateAuthCommandOutput) {
    switch (resp.ChallengeName) {
      case ChallengeNameType.NEW_PASSWORD_REQUIRED:
        return {
          ChallengeName: ChallengeNameType.NEW_PASSWORD_REQUIRED,
          Session: resp.Session,
        };
      case ChallengeNameType.MFA_SETUP:
        const res = await this._sendSetupMFACommand(resp.Session);
        return {
          ChallengeName: ChallengeNameType.MFA_SETUP,
          Session: res.Session,
          SecretCode: res.SecretCode,
        };
      default:
        return { ChallengeName: resp.ChallengeName, Session: resp.Session };
    }
  }

  private _sendResendConfirmationCodeCommand(input: EmailOnlyInput) {
    const command = new ResendConfirmationCodeCommand({
      ClientId: this.clientId,
      Username: input.email,
    });

    return this.client.send(command);
  }

  private _sendForgotPasswordCommand(email: string) {
    const command = new ForgotPasswordCommand({
      ClientId: this.clientId,
      Username: email,
    });

    return this.client.send(command);
  }

  private _sendConfirmForgotPasswordCommand(input: ResetPasswordInput) {
    const command = new ConfirmForgotPasswordCommand({
      ClientId: this.clientId,
      ConfirmationCode: input.code,
      Password: input.password,
      Username: input.email,
    });
    return this.client.send(command);
  }

  private _sendRefreshTokenCommand(refreshToken: string) {
    const command = new InitiateAuthCommand({
      ClientId: this.clientId,
      AuthFlow: AuthFlowType.REFRESH_TOKEN,
      AuthParameters: {
        REFRESH_TOKEN: refreshToken,
      },
    });

    return this.client.send(command);
  }

  private _sendMFASetupCommand(input: SetupMFAInput) {
    const verifyCommand = new VerifySoftwareTokenCommand({
      Session: input.session,
      UserCode: input.code,
    });

    return this.client.send(verifyCommand);
  }

  private _sendConfirmLoginCommand(input: ConfirmLoginInput) {
    const command = new RespondToAuthChallengeCommand({
      ClientId: this.clientId,
      ChallengeName: ChallengeNameType.SOFTWARE_TOKEN_MFA,
      Session: input.session,
      ChallengeResponses: {
        USERNAME: input.email,
        SOFTWARE_TOKEN_MFA_CODE: input.code,
      },
    });
    return this.client.send(command);
  }

  async signup(input: SignupInput) {
    if (this._checkIfEmailExists(input.email))
      throw new DuplicateEmailException();

    try {
      await this._createNewUser(input);
    } catch (err) {
      throw new BadRequestException(err.message);
    }
  }

  async confirmSignup(input: ConfirmSignupInput) {
    try {
      await this._sendConfirmUserSignupCommand(input);
      await this._updateUserAfterSignupConfirmation(input.email);
    } catch (err) {
      return new InvalidUpdateUserException(err.message);
    }
  }

  async login(input: LoginInput) {
    try {
      const resp = await this._sendLoginCommand(input);

      return this._handleLoginCommandResponse(resp);
    } catch (err) {
      throw new LoginUserException(err.message);
    }
  }

  async setupMFA(input: SetupMFAInput) {
    try {
      return await this._sendMFASetupCommand(input);
    } catch (error) {
      const { name, message } = error;
      throw new SetupMFAException(name, message);
    }
  }

  async confirmLogin(input: ConfirmLoginInput) {
    try {
      const res = await this._sendConfirmLoginCommand(input);
      return res.AuthenticationResult;
    } catch (error) {
      const { name } = error;
      if (name === 'CodeMismatchException' || name === 'ExpiredCodeException') {
        throw new BadRequestException({
          message: 'Invalid code, please try again',
          name: 'CodeMismatchException',
        });
      }
      if (name === 'NotAuthorizedException')
        throw new BadRequestException({
          message: 'Session expired, please try again',
          name: 'NotAuthorizedException',
        });

      throw error;
    }
  }

  async resendConfirmationCode(input: EmailOnlyInput) {
    try {
      await this._sendResendConfirmationCodeCommand(input);
    } catch (error) {
      throw new ResendConfirmationCodeException(error.message);
    }
  }

  async forgotPassword(email: string) {
    try {
      await this._sendForgotPasswordCommand(email);
    } catch (error) {
      throw error;
    }
  }

  async resetPassword(input: ResetPasswordInput) {
    try {
      return await this._sendConfirmForgotPasswordCommand(input);
    } catch (error) {
      throw new ConfirmForgotPasswordException(error.name, error.message);
    }
  }

  async refreshToken(refreshToken: string) {
    try {
      return await this._sendRefreshTokenCommand(refreshToken);
    } catch (error) {
      throw error;
    }
  }
}
