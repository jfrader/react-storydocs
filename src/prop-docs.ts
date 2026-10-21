export interface CatalogRef {
  name: string;
  slug: string;
}

export interface TypeParameterDoc {
  name: string;
  constraint?: string;
  default?: string;
}

export interface PropElementDoc {
  /** Element type of an array prop, e.g. `SelectOption`. */
  type: string;
  members: PropDoc[];
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
  defaultElement?: string;
  /**
   * The `data-ui` token this part renders as, when the component's own source declares one for
   * this key. It names the default: what a reader would be styling or replacing.
   */
  part?: string;
  tags?: { name: string; text: string }[];
  members?: PropDoc[];
  signatures?: {
    type: string;
    parameters: { name: string; type: string; description: string }[];
  }[];
  /** Fields of an array element type, e.g. what each `options` entry accepts. */
  element?: PropElementDoc;
  /** Overload index this prop belongs to when another overload excludes it. */
  signature?: number;
}

export interface ComponentPropsDoc {
  name: string;
  description?: string;
  props: PropDoc[];
  /** Generic parameters declared by the component, e.g. `V extends string = string`. */
  typeParameters?: TypeParameterDoc[];
  /** Native element whose full prop set also applies (e.g. `button` for Dialog.Trigger). */
  native?: string;
}

/** Passed to the consumer module configured as `api.module`. */
export interface ApiRendererProps {
  components: ComponentPropsDoc[] | null;
  argTypes: Record<string, unknown>;
  defaultArgs: Record<string, unknown>;
}
