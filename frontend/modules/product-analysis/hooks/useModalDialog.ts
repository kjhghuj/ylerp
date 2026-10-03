import {useEffect,useRef,type RefObject} from 'react';

export function useModalDialog(ref:RefObject<HTMLElement>,onClose:()=>void,active=true){
  const latest=useRef({onClose,active});latest.current={onClose,active};
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null;
    const focusable=()=>Array.from(ref.current?.querySelectorAll<HTMLElement>('*')||[])
      .filter(element=>element.tabIndex>=0&&!element.matches(':disabled')&&!element.closest('[hidden]'));
    (focusable()[0]||ref.current)?.focus();
    const keydown=(event:KeyboardEvent)=>{
      if(!latest.current.active)return;
      if(event.key==='Escape'){
        event.preventDefault();event.stopImmediatePropagation();latest.current.onClose();
      }else if(event.key==='Tab'){
        const items=focusable(),first=items[0],last=items[items.length-1];
        if(!first){event.preventDefault();ref.current?.focus();return;}
        if(event.shiftKey&&(document.activeElement===first||!ref.current?.contains(document.activeElement))){event.preventDefault();last.focus();}
        else if(!event.shiftKey&&(document.activeElement===last||!ref.current?.contains(document.activeElement))){event.preventDefault();first.focus();}
      }
    };
    document.addEventListener('keydown',keydown);
    return()=>{
      document.removeEventListener('keydown',keydown);
      // The parent removes inert in the same effect flush; focusing earlier fails in real browsers.
      queueMicrotask(()=>{if(previous?.isConnected)previous.focus();});
    };
  },[ref]);
}
