import { ButtonHandler, HandlerType } from '../toolbar/help';
import { InlineFormatter } from '../toolbar/inline-formatter';

export const subscriptHandler: ButtonHandler = {
  type: HandlerType.Button,
  classes: ['tanbo-editor-icon-subscript'],
  tooltip: '下标',
  match: {
    tags: ['SUB']
  },
  execCommand: new InlineFormatter('subscript')
};
