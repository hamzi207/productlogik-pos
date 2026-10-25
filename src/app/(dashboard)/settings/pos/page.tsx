import { permanentRedirect } from "next/navigation";

/** The POS tab (tax) joined Printing as Tax & Printing; old links land there. */
export default function SettingsPosPage() {
  permanentRedirect("/settings/printing");
}
