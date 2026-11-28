"use client";

import { Camera, CameraOff, Flashlight, Search, WifiOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { buttonClasses } from "@/components/ui/button-classes";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { IconButton } from "@/components/ui/IconButton";
import { SidePanel } from "@/components/ui/SidePanel";
import { TextField } from "@/components/ui/TextField";
import { toast } from "@/components/ui/Toast";
import { newId } from "@/lib/id";
import { DESKTOP_QUERY, useMediaQuery } from "@/lib/use-media-query";
import { useOnline } from "@/lib/use-online";
import type { MemberRef } from "@/server/services/member-qr";
import { setTorch, startCamera, stopCamera } from "./camera";
import { MEMBER_ID_TYPING, readScanText, typedMemberId } from "./scan-text";
import { refusalMessage, SCAN_COPY, scanRow, type VerifyFound } from "./view";
import { verifyMemberQrAction } from "../member-card/actions";
import { scanAwardAction } from "../requests/actions";
import { ApproveForm, type PreviewInputs } from "../requests/ApproveForm";
import type { Decoder } from "./decoder";
import "./scan.css";

type Cam = "idle" | "starting" | "live" | "denied" | "unavailable";
type Found = { ref: MemberRef; member: VerifyFound; key: string };

/** How often a frame is read while the camera is live; the native detector and the worker both keep up. */
const READ_EVERY_MS = 150;
/** No code read for this long: suggest light, distance, the torch or typing the ID ("poor light"). */
const HINT_AFTER_MS = 8_000;
/** The same unusable code isn't checked again for this long (the camera sees it many times a second). */
const SAME_CODE_MS = 3_000;
export const AWARDED_AGAIN =
  "Gold was just awarded for this member QR. For another visit, ask the customer to refresh their card.";

const requestHref = (open: NonNullable<VerifyFound["openRequest"]>): string =>
  `/dashboard/requests?${open.awaitingOwner ? "tab=awaiting&" : ""}approve=${open.id}`;

/**
 * The member scanner (P2-02, PRODUCT §5 "Member QR scan", §18; DESIGN §11, §15 screen 18). Staff point the camera
 * at a customer's member QR, or type the member ID from an offline card. The token or ID is verified on the
 * server for this shop (only a current member gets a name back), then the award panel opens: the Requests
 * approve form, which awards through `scanAwardAction` (a `source = 'scan'` request decided at once, every award
 * guard applied; the server re-verifies the token, design check M5). A member with a request already waiting
 * is sent to that request instead. The camera starts only on a tap (after the explainer), stops when the page
 * is hidden, and never runs offline, where awards can't be made.
 */
export function MemberScanner({
  shopId,
  role,
  preview,
}: {
  shopId: string;
  role: "owner" | "staff";
  preview: PreviewInputs;
}): React.JSX.Element {
  const router = useRouter();
  const online = useOnline();
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const Overlay = desktop ? SidePanel : BottomSheet;

  const [cam, setCam] = useState<Cam>("idle");
  const [torch, setTorchState] = useState<{ supported: boolean; on: boolean }>({
    supported: false,
    on: false,
  });
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [hint, setHint] = useState(false);
  const [found, setFound] = useState<Found | null>(null);
  const [typed, setTyped] = useState("");
  const [typedError, setTypedError] = useState<string | undefined>();
  const [tries, setTries] = useState(0);
  const [decoderKind, setDecoderKind] = useState<Decoder["kind"] | null>(null);

  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const decoder = useRef<Decoder | null>(null);
  const last = useRef<{ text: string; at: number } | null>(null);
  const resume = useRef(false);
  const busy = useRef(false);
  /** Tokens awarded on this page: still in front of the camera after the panel closes, they never reopen it. */
  const awarded = useRef(new Set<string>());
  /**
   * Tokens the server refused (expired, invalid, not a member, own card), with the answer: a refused QR left in
   * front of the camera is answered from here, never sent again, so it can't use up the verify limits.
   */
  const refused = useRef(new Map<string, string>());

  const stop = useCallback((): void => {
    stopCamera(stream.current);
    stream.current = null;
    if (video.current) video.current.srcObject = null;
    setTorchState({ supported: false, on: false });
  }, []);

  const start = useCallback(async (): Promise<void> => {
    setMessage(null);
    setCam("starting");
    const started = await startCamera();
    if (!started.ok) {
      setCam(started.reason);
      return;
    }
    stream.current = started.stream;
    setTorchState({ supported: started.torch, on: false });
    const v = video.current;
    if (v) {
      v.srcObject = started.stream;
      await v.play().catch(() => undefined);
    }
    if (!decoder.current) {
      const { createDecoder } = await import("./decoder");
      decoder.current = await createDecoder();
      setDecoderKind(decoder.current.kind);
    }
    setCam("live");
  }, []);

  // Release the camera and the decoder when the page goes away.
  useEffect(
    () => () => {
      stop();
      decoder.current?.close();
      decoder.current = null;
    },
    [stop],
  );

  // A hidden page never keeps the camera: it stops, and starts again when the page is back.
  useEffect(() => {
    const onVisibility = (): void => {
      if (document.visibilityState === "hidden") {
        if (stream.current) {
          resume.current = true;
          stop();
          setCam("idle");
        }
      } else if (resume.current) {
        resume.current = false;
        void start();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [start, stop]);

  const verify = useCallback(
    async (ref: MemberRef): Promise<void> => {
      if (busy.current) return;
      busy.current = true;
      setChecking(true);
      try {
        const res = await verifyMemberQrAction({ shopId, ...ref });
        if (!res.ok) {
          setMessage(res.error.message);
          return;
        }
        const d = res.data;
        if (d.status === "ok") {
          setMessage(null);
          setFound({ ref, member: d, key: newId() });
        } else {
          const answer = refusalMessage(d.status, "token" in ref ? "qr" : "member_id");
          if ("token" in ref) refused.current.set(ref.token, answer);
          setMessage(answer);
        }
      } finally {
        busy.current = false;
        setChecking(false);
      }
    },
    [shopId],
  );

  // Read frames while the camera is live, nothing is being checked and no award panel is open.
  const reading = cam === "live" && online && !checking && found === null;
  useEffect(() => {
    if (!reading) return;
    let timer = 0;
    let stopped = false;
    const startedAt = Date.now();
    const tick = async (): Promise<void> => {
      const v = video.current;
      const text = v && decoder.current ? await decoder.current.read(v) : null;
      if (stopped) return;
      if (text) {
        const now = Date.now();
        const seen = last.current;
        if (!seen || seen.text !== text || now - seen.at > SAME_CODE_MS) {
          last.current = { text, at: now };
          const scan = readScanText(text);
          const known = scan.kind === "member" ? refused.current.get(scan.token) : undefined;
          if (scan.kind === "member" && awarded.current.has(scan.token)) {
            setMessage(AWARDED_AGAIN);
          } else if (known) {
            setMessage(known);
          } else if (scan.kind === "member") {
            setHint(false);
            void verify({ token: scan.token });
            return;
          } else {
            setMessage(scan.kind === "shop" ? SCAN_COPY.shopQr : SCAN_COPY.otherQr);
          }
        }
      } else if (Date.now() - startedAt > HINT_AFTER_MS) {
        setHint(true);
      }
      timer = window.setTimeout(() => void tick(), READ_EVERY_MS);
    };
    timer = window.setTimeout(() => void tick(), READ_EVERY_MS);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [reading, verify]);

  const close = (): void => {
    setFound(null);
    last.current = null;
  };
  /** The award went through (or can't be made any more): this QR won't open the panel again here. */
  const done = (): void => {
    if (found && "token" in found.ref) awarded.current.add(found.ref.token);
    close();
  };

  const submitTyped = (): void => {
    const id = typedMemberId(typed);
    if (!id) {
      setTypedError(SCAN_COPY.memberIdInvalid);
      setTries((n) => n + 1);
      return;
    }
    setTypedError(undefined);
    void verify({ memberId: id });
  };

  const toggleTorch = async (): Promise<void> => {
    const on = !torch.on;
    const ok = await setTorch(stream.current, on);
    setTorchState(ok ? { supported: true, on } : { supported: false, on: false });
  };

  const member = found?.member;
  const open = member?.openRequest ?? null;
  const live = cam === "live" || cam === "starting";

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
      <Card className="flex flex-col gap-3 p-4" data-testid="scanner">
        <div
          className="m-scan-view"
          data-state={cam}
          data-decoder={decoderKind ?? undefined}
          data-testid="scanner-view"
        >
          <video
            ref={video}
            muted
            playsInline
            aria-hidden="true"
            className={live ? undefined : "invisible"}
          />
          {live ? (
            <div className="m-scan-frame" aria-hidden="true">
              {reading ? <span className="m-scan-line" /> : null}
            </div>
          ) : (
            <div className="text-ivory absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
              <Icon icon={cam === "idle" ? Camera : CameraOff} size={32} />
              <p className="text-body max-w-sm" data-testid="scanner-explainer">
                {cam === "denied"
                  ? SCAN_COPY.denied
                  : cam === "unavailable"
                    ? SCAN_COPY.noCamera
                    : SCAN_COPY.explainer}
              </p>
            </div>
          )}
          {cam === "live" && (checking || hint) ? (
            <p className="m-scan-note text-small" aria-hidden="true">
              {checking ? "Checking the member card…" : "Can't read it? See the tips below."}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {live ? (
            <Button
              variant="ghost"
              size={46}
              icon={<Icon icon={CameraOff} size={18} />}
              onClick={() => {
                stop();
                setCam("idle");
                setHint(false);
              }}
              data-testid="scanner-stop"
            >
              Stop camera
            </Button>
          ) : (
            <Button
              size={46}
              icon={<Icon icon={Camera} size={18} />}
              onClick={() => void start()}
              disabled={!online || cam === "unavailable"}
              data-testid="scanner-start"
            >
              {cam === "denied" ? "Try the camera again" : "Start camera"}
            </Button>
          )}
          {torch.supported && cam === "live" ? (
            <IconButton
              icon={Flashlight}
              label="Torch"
              pressed={torch.on}
              onPressedChange={() => void toggleTorch()}
              data-testid="scanner-torch"
            />
          ) : null}
        </div>
        <div aria-live="polite" className="flex flex-col gap-2">
          {!online ? (
            <p
              className="text-small text-ink-2 flex items-center gap-2"
              data-testid="scanner-offline"
            >
              <Icon icon={WifiOff} size={16} />
              {SCAN_COPY.offline}
            </p>
          ) : null}
          {message ? (
            <p className="text-small text-danger font-semibold" data-testid="scanner-message">
              {message}
            </p>
          ) : null}
          {hint && cam === "live" ? (
            <p className="text-small text-ink-2" data-testid="scanner-hint">
              Ask the customer to turn their screen brightness up and hold the card still, 15 to 25
              cm away{torch.supported ? ", or turn on the torch" : ""}. You can also type the member
              ID.
            </p>
          ) : null}
        </div>
      </Card>
      <Card className="flex flex-col gap-3 p-4">
        <h2 className="text-h3">Type a member ID</h2>
        <p className="text-small text-ink-2">
          For a customer without signal: their card shows the member ID even offline.
        </p>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            submitTyped();
          }}
          data-testid="scanner-manual"
        >
          <TextField
            label="Member ID"
            name="memberId"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="K7Q-42M"
            value={typed}
            onChange={(e) => {
              const v = e.target.value.trim();
              if (MEMBER_ID_TYPING.test(v)) {
                setTyped(v.toUpperCase());
                setTypedError(undefined);
              }
            }}
            hint={SCAN_COPY.memberIdHint}
            error={typedError}
            errorKey={tries}
          />
          <Button
            type="submit"
            variant="orbit"
            icon={<Icon icon={Search} size={18} />}
            loading={checking && cam !== "live"}
            disabled={!online}
            data-testid="scanner-find"
          >
            Find member
          </Button>
        </form>
      </Card>
      <Overlay
        open={found !== null}
        onClose={close}
        title={open ? "Request waiting" : "Award gold"}
        description={member ? `${member.name} · ${member.memberId}` : undefined}
      >
        {found && member && open ? (
          <div className="flex flex-col gap-4" data-testid="scanner-open-request">
            {open.awaitingOwner && role !== "owner" ? (
              <p className="text-body">
                {member.name} has an award waiting for the owner&apos;s approval. The owner can
                approve it on the Requests page.
              </p>
            ) : (
              <>
                <p className="text-body">
                  {member.name} already asked for gold. Approve that request instead, so the visit
                  is only counted once.
                </p>
                <Link
                  href={requestHref(open)}
                  className={buttonClasses({ block: true })}
                  data-testid="scanner-open-request-link"
                >
                  Open their request
                </Link>
              </>
            )}
          </div>
        ) : found && member ? (
          <ApproveForm
            key={found.key}
            shopId={shopId}
            row={scanRow(member, preview.versions, new Date())}
            streak={member.streak}
            preview={preview}
            pad={!desktop}
            onDone={done}
            award={(input) =>
              scanAwardAction({ shopId, member: found.ref, idempotencyKey: found.key, ...input })
            }
            onOpenRequest={(requestId) => {
              toast(`${member.name} already asked for gold: approve that request.`, "info");
              router.push(`/dashboard/requests?approve=${requestId}`);
            }}
          />
        ) : null}
      </Overlay>
    </div>
  );
}
