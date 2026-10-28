import React, { useState } from 'react';
import { HelpCircle } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '../../../components/ui/dialog';

interface HelpTooltipProps { title: string; content: string; }
/** Detailed help is a dialog, not a hover-only tooltip. The span trigger remains safe inside action buttons. */
const HelpTooltip: React.FC<HelpTooltipProps> = ({ title, content }) => {
  const [open, setOpen] = useState(false);
  return <span className="inline-flex" onClick={event => event.stopPropagation()} onPointerDown={event => event.stopPropagation()}><Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild><span role="button" tabIndex={0} aria-label={title}
      onClick={event => { event.preventDefault(); event.stopPropagation(); setOpen(true); }}
      onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); setOpen(true); } }}
      className="inline-flex h-11 w-11 cursor-pointer sm:h-6 sm:w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><HelpCircle size={15} /></span></DialogTrigger>
    <DialogContent className="w-[calc(100%-2rem)] rounded-xl" onClick={event => event.stopPropagation()}>
      <DialogTitle className="flex items-center gap-2"><HelpCircle className="h-4 w-4 text-primary" />{title}</DialogTitle>
      <DialogDescription className="whitespace-pre-line text-sm leading-relaxed">{content.replaceAll('\\n', '\n')}</DialogDescription>
      <div className="flex justify-end"><Button onClick={event => { event.stopPropagation(); setOpen(false); }}>知道了</Button></div>
    </DialogContent>
  </Dialog></span>;
};
export default HelpTooltip;
