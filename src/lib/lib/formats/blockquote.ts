import { ButtonHandler, HandlerType } from '../toolbar/help';
import { BlockFormatter } from '../toolbar/block-formatter';

export const blockquoteHandler: ButtonHandler = {
  type: HandlerType.Button,
  classes: ['tanbo-editor-icon-quotes-right'],
  tooltip: '引用',
  match: {
    tags: ['BLOCKQUOTE']
  },
  execCommand: new BlockFormatter('blockquote')
};
