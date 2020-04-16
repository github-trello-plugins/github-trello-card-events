import { IAttachment, IBoard, ICard } from './trello';

export interface IDataResponse<T> {
  data: T;
}

export interface IErrorResponse {
  error: string;
  message: string;
}

interface IGetCardParams {
  boardId: string;
  cardNumber: string;
}

interface IMoveCardParams {
  cardId: string;
  idList: string;
}

interface IAddAttachmentToCardParams {
  cardId: string;
  name: string;
  url: string;
}

interface IAddCommentToCardParams {
  cardId: string;
  text: string;
}

export interface IExtendedGitHub {
  trello: {
    listBoards(): Promise<IErrorResponse | IDataResponse<IBoard[]>>;
    getCard(params: IGetCardParams): Promise<IErrorResponse | IDataResponse<ICard>>;
    moveCard(params: IMoveCardParams): Promise<IErrorResponse | IDataResponse<ICard>>;
    addAttachmentToCard(params: IAddAttachmentToCardParams): Promise<IErrorResponse | IDataResponse<IAttachment>>;
    addCommentToCard(params: IAddCommentToCardParams): Promise<IErrorResponse | IDataResponse<void>>;
  };
}
