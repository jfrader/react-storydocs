export interface CatalogRef {
  name: string;
  slug: string;
}

export interface PropDoc {
  name: string;
  type: string;
  typeUnavailable?: boolean;
  required: boolean;
  defaultValue: string | null;
  description: string;
  inheritedFrom?: string;
  inheritedComponent?: CatalogRef;
  /** Another catalog component whose declaration this type belongs to. */
  component?: CatalogRef;
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
