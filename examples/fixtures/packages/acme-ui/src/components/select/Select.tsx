import type { ReactNode } from 'react';

export type SelectProps = {
  value?: string;
  onChange?: (value: string) => void;
  children?: ReactNode;
  [key: string]: unknown;
};

export type SelectItemProps = {
  value: string;
  children: ReactNode;
  [key: string]: unknown;
};

function SelectRoot({ children, ...props }: SelectProps) {
  return (
    <div className="select" {...props}>
      {children}
    </div>
  );
}

function SelectItem({ value, children, ...props }: SelectItemProps) {
  return (
    <div className="item" data-value={value} {...props}>
      {children}
    </div>
  );
}

export const Select = Object.assign(SelectRoot, {
  Item: SelectItem,
});
