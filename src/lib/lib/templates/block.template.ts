import {
  TemplateTranslator,
  ViewData,
  Fragment,
  VElement,
  EventType,
  BranchTemplate
} from '../core/_api';
import { SingleTagTemplate } from './single-tag.template';

export class BlockTemplateTranslator implements TemplateTranslator {
  constructor(private tagNames: string[]) {
  }

  match(template: HTMLElement): boolean {
    return this.tagNames.includes(template.nodeName.toLowerCase());
  }

  from(el: HTMLElement): ViewData {
    const template = new BlockTemplate(el.tagName.toLocaleLowerCase());
    return {
      template,
      childrenSlots: [{
        from: el,
        toSlot: template.slot
      }]
    };
  }
}

export class BlockTemplate extends BranchTemplate {
  constructor(tagName: string) {
    super(tagName);
  }

  clone() {
    const template = new BlockTemplate(this.tagName);
    template.slot.from(this.slot.clone());
    return template;
  }

  render(isProduction: boolean) {
    const block = new VElement(this.tagName);
    !isProduction && block.events.subscribe(event => {
      if (event.type === EventType.onEnter) {
        const parent = event.renderer.getParentFragment(this);

        const template = new BlockTemplate('p');
        const fragment = template.slot;
        const firstRange = event.selection.firstRange;
        const c = firstRange.startFragment.cut(firstRange.startIndex);
        if (firstRange.startFragment.contentLength === 0) {
          firstRange.startFragment.append(new SingleTagTemplate('br'));
        }
        if (c.contents.length) {
          c.contents.forEach(cc => fragment.append(cc));
        } else {
          fragment.append(new SingleTagTemplate('br'));
        }
        c.formatRanges.forEach(ff => fragment.apply(ff));
        parent.insert(template, parent.indexOf(this) + 1);
        const position = firstRange.findFirstPosition(fragment);
        firstRange.startFragment = firstRange.endFragment = position.fragment;
        firstRange.startIndex = firstRange.endIndex = position.index;
        event.stopPropagation();
      }
    })
    return block;
  }
}
