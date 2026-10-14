export interface PropDoc {
  name: string;
  type: string;
  typeUnavailable?: boolean;
  required: boolean;
  defaultValue: string | null;
  description: string;
  inheritedFrom?: string;
  inheritedComponent?: { name: string; slug: string };
  tags?: { name: string; text: string }[];
  members?: PropDoc[];
  signatures?: {
    type: string;
    parameters: { name: string; type: string; description: string }[];
  }[];
}

export interface ComponentPropsDoc {
  name: string;
  props: PropDoc[];
  /** Native element whose full prop set also applies (e.g. `button` for Dialog.Trigger). */
  native?: string;
}
