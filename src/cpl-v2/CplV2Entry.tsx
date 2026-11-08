import type { User } from "firebase/auth";
import CplApp from "./CplApp";
import "./styles/cpl.css";

interface CplV2EntryProps {
  user: User | null;
  onSignIn: () => void;
  onBackMain: () => void;
}

export default function CplV2Entry({
  user,
  onSignIn,
  onBackMain,
}: CplV2EntryProps) {
  return (
    <CplApp
      user={user}
      onSignIn={onSignIn}
      onBackMain={onBackMain}
    />
  );
}