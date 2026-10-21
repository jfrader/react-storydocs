import { TextField, type TextFieldProps } from '@mui/material';

export type MuiFieldProps = TextFieldProps & {
  /** Short helper line below the field. */
  hint?: string;
};

export function MuiField({ hint, helperText, ...props }: MuiFieldProps) {
  return <TextField helperText={hint ?? helperText} {...props} />;
}
