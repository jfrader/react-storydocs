export interface PropDoc {
  name: string;
  type: string;
  typeUnavailable?: boolean;
  required: boolean;
  defaultValue: string | null;
  description: string;
  inheritedFrom?: string;
  tags?: { name: string; text: string }[];
  members?: PropDoc[];
}

export interface ComponentPropsDoc {
  name: string;
  props: PropDoc[];
  /** Native element whose full prop set also applies (e.g. `button` for Dialog.Trigger). */
  native?: string;
}
