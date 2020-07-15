import * as request from 'request-promise';

interface IPostMessageBaseParams {
  webhookUrl?: string;
  icon?: string;
  channel?: string;
}

export interface IPostMessageMarkdownParams extends IPostMessageBaseParams {
  isText?: false;
  title?: string;
  message: string;
  borderColor?: 'good' | 'danger';
  username?: string;
}

export interface IPostMessageTextParams extends IPostMessageBaseParams {
  isText: true;
  message: string;
}

interface IPayload {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  icon_emoji?: string;
  channel?: string;
  text?: string;
  attachments?: {
    title?: string;
    text: string;
    // eslint-disable-next-line @typescript-eslint/naming-convention
    mrkdwn_in: string[];
    color?: string;
  }[];
}

export interface IPostErrorMessageParams {
  webhookUrl?: string;
  error: Error;
}

export async function postMessage(args: IPostMessageMarkdownParams | IPostMessageTextParams): Promise<void> {
  // NOTE: https://api.slack.com/reference/messaging/attachments
  const payload: IPayload = {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    icon_emoji: args.icon,
    channel: args.channel,
  };

  if (args.isText) {
    payload.text = args.message;
  } else {
    payload.attachments = [
      {
        title: args.title,
        text: args.message,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        mrkdwn_in: ['text'],
        color: args.borderColor,
      },
    ];
  }

  const uri = args.webhookUrl || process.env.SLACK_WEBHOOK_URL;
  if (!uri) {
    throw new Error('No slack webhook uri specified');
  }

  try {
    await request.post(uri, {
      json: payload,
      timeout: 10000,
    });
  } catch (ex) {
    console.error(ex);
  }
}

export async function postErrorMessage(args: IPostErrorMessageParams): Promise<void> {
  try {
    const webhookUrl = args.webhookUrl || process.env.SLACK_ERROR_WEBHOOK_URL || process.env.SLACK_WEBHOOK_URL;
    if (!webhookUrl) {
      console.error('No slack error webhook uri specified');
      return;
    }

    const simpleError = {
      message: args.error.message,
      stack: args.error.stack || new Error().stack,
    };

    await postMessage({
      isText: false,
      webhookUrl,
      message: `\`\`\`\n${JSON.stringify(simpleError, null, 2)}\n\`\`\``,
      borderColor: 'danger',
    });
  } catch (ex) {
    console.error(ex);
  }
}
