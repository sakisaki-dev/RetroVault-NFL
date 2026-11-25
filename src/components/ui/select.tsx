import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";

import { cn } from "@/lib/utils";
import { SEARCH_MIN, bestMatch, isTypeKey, matchTier, plainText, typeBuffer } from "@/utils/typeahead";

/**
 * Type-to-select (owner: "the bar can stay as a dropdown, but if I type in viking it should automatically select that
 * option"). The wrapper keeps a registry of its items (value and text, kept by each SelectItem) so that, with the
 * trigger focused and the menu closed, typing picks the best match at once ("viking" for "Minnesota Vikings"; rules in
 * utils/typeahead.ts); an open menu of 8+ items shows a search field that filters the list, takes focus on open
 * (a tap on a phone included) and picks the first match on Enter. Radix's own first-letter typeahead is skipped.
 */
interface SelectCtx {
  items: React.MutableRefObject<Map<string, string>>;
  query: string;
  setQuery: (q: string) => void;
  pick: (value: string) => void;
  close: () => void;
}
const SelectContext = React.createContext<SelectCtx | null>(null);

const Select = ({
  value,
  defaultValue,
  onValueChange,
  open,
  defaultOpen,
  onOpenChange,
  ...rest
}: React.ComponentPropsWithoutRef<typeof SelectPrimitive.Root>) => {
  const items = React.useRef(new Map<string, string>());
  const [query, setQuery] = React.useState("");
  const [inner, setInner] = React.useState(defaultValue);
  const [innerOpen, setInnerOpen] = React.useState(!!defaultOpen);
  const val = value !== undefined ? value : inner;
  const isOpen = open !== undefined ? open : innerOpen;
  const setOpen = (o: boolean) => {
    setQuery("");
    if (open === undefined) setInnerOpen(o);
    onOpenChange?.(o);
  };
  const pick = (v: string) => {
    if (value === undefined) setInner(v);
    onValueChange?.(v);
  };
  const ctx = React.useMemo(() => ({ items, query, setQuery, pick, close: () => setOpen(false) }), [query, value, onValueChange, open]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <SelectContext.Provider value={ctx}>
      <SelectPrimitive.Root {...rest} value={val} onValueChange={pick} open={isOpen} onOpenChange={setOpen} />
    </SelectContext.Provider>
  );
};

const SelectGroup = SelectPrimitive.Group;

const SelectValue = SelectPrimitive.Value;

const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, onKeyDown, ...props }, ref) => {
  const ctx = React.useContext(SelectContext);
  const typed = React.useRef(typeBuffer());
  return (
  <SelectPrimitive.Trigger
    ref={ref}
    onKeyDown={(e) => {
      onKeyDown?.(e);
      if (e.defaultPrevented || !ctx || !isTypeKey(e) || (e.key === " " && !typed.current.active())) return;
      // closed and focused: letters pick the best match at once, like a native select
      const entries = [...ctx.items.current.entries()];
      if (!entries.length) return;
      e.preventDefault();
      const hit = bestMatch(entries.map(([, t]) => t), typed.current.push(e.key));
      if (hit >= 0) ctx.pick(entries[hit][0]);
    }}
    className={cn(
      "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1",
      className,
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <ChevronDown className="h-4 w-4 opacity-50" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
  );
});
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName;

const SelectScrollUpButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollUpButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollUpButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollUpButton
    ref={ref}
    className={cn("flex cursor-default items-center justify-center py-1", className)}
    {...props}
  >
    <ChevronUp className="h-4 w-4" />
  </SelectPrimitive.ScrollUpButton>
));
SelectScrollUpButton.displayName = SelectPrimitive.ScrollUpButton.displayName;

const SelectScrollDownButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollDownButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollDownButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollDownButton
    ref={ref}
    className={cn("flex cursor-default items-center justify-center py-1", className)}
    {...props}
  >
    <ChevronDown className="h-4 w-4" />
  </SelectPrimitive.ScrollDownButton>
));
SelectScrollDownButton.displayName = SelectPrimitive.ScrollDownButton.displayName;

/** The open menu's search field: filters the items, focused on open, Enter picks the first match, arrows move into the list */
const SelectSearch = ({ ctx }: { ctx: SelectCtx }) => {
  const input = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    // after Radix has put focus on the selected item
    const t = window.setTimeout(() => input.current?.focus({ preventScroll: true }), 40);
    return () => window.clearTimeout(t);
  }, []);
  const list = () => {
    const el = input.current?.closest("[role=listbox]") ?? input.current?.parentElement;
    return [...(el?.querySelectorAll<HTMLElement>("[role=option]") ?? [])];
  };
  return (
    <div className="border-b border-border/60 p-1.5">
      <input
        ref={input}
        type="text"
        role="searchbox"
        aria-label="Search the list"
        placeholder="Type to search"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        enterKeyHint="go"
        value={ctx.query}
        onChange={(e) => ctx.setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" || e.key === "Tab") return;
          e.stopPropagation(); // Radix's own typeahead must not take the letters
          if (e.key === "Enter") {
            e.preventDefault();
            const first = [...ctx.items.current.entries()].find(([, t]) => matchTier(t, ctx.query) > 0);
            if (first) (ctx.pick(first[0]), ctx.close());
          } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            const o = list();
            (e.key === "ArrowDown" ? o[0] : o[o.length - 1])?.focus();
          }
        }}
        className="h-9 w-full rounded-md border border-input bg-background px-3 text-base outline-none focus:ring-2 focus:ring-ring sm:text-sm"
      />
      {ctx.query.trim() && ![...ctx.items.current.values()].some((t) => matchTier(t, ctx.query) > 0) && (
        <p className="px-2 pb-0.5 pt-2 text-xs text-muted-foreground" role="status">No match</p>
      )}
    </div>
  );
};

const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = "popper", ...props }, ref) => {
  const ctx = React.useContext(SelectContext);
  const searchable = !!ctx && ctx.items.current.size >= SEARCH_MIN;
  return (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      className={cn(
        "relative z-50 max-h-96 min-w-[8rem] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md pop-anim",
        position === "popper" &&
          "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1",
        className,
      )}
      position={position}
      {...props}
    >
      {searchable && ctx && <SelectSearch ctx={ctx} />}
      <SelectScrollUpButton />
      <SelectPrimitive.Viewport
        className={cn(
          "p-1",
          position === "popper" &&
            "h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]",
        )}
      >
        {children}
      </SelectPrimitive.Viewport>
      <SelectScrollDownButton />
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
  );
});
SelectContent.displayName = SelectPrimitive.Content.displayName;

const SelectLabel = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Label ref={ref} className={cn("py-1.5 pl-8 pr-2 text-sm font-semibold", className)} {...props} />
));
SelectLabel.displayName = SelectPrimitive.Label.displayName;

const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => {
  const ctx = React.useContext(SelectContext);
  const text = props.textValue ?? plainText(children);
  const { items } = ctx ?? {};
  React.useEffect(() => {
    if (!items) return;
    items.current.set(props.value, text);
    return () => {
      items.current.delete(props.value);
    };
  }, [items, props.value, text]);
  // an item the search field filters out stays mounted (the selected one must keep filling the trigger) but hidden and disabled, so arrow keys skip it
  const filtered = !!ctx && !!ctx.query.trim() && matchTier(text, ctx.query) === 0;
  return (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 focus:bg-accent focus:text-accent-foreground [&[hidden]]:hidden",
      className,
    )}
    {...props}
    disabled={filtered || props.disabled}
    hidden={filtered}
  >
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <Check className="h-4 w-4" />
      </SelectPrimitive.ItemIndicator>
    </span>

    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
  );
});
SelectItem.displayName = SelectPrimitive.Item.displayName;

const SelectSeparator = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Separator ref={ref} className={cn("-mx-1 my-1 h-px bg-muted", className)} {...props} />
));
SelectSeparator.displayName = SelectPrimitive.Separator.displayName;

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
};
