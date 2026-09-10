import { Modal as NativeModal, type ModalProps } from "react-native";
import { useReducedMotion } from "./motion";
import { useContentLocked } from "./privacy-boundary";

export function Modal({ animationType, ...props }: ModalProps) {
  const reduced = useReducedMotion();
  const locked = useContentLocked();
  return (
    <NativeModal
      {...props}
      visible={!locked && props.visible !== false}
      animationType={locked || reduced ? "none" : animationType}
    />
  );
}
