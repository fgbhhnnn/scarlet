import { lazy, Suspense } from "react";
import { Drawer, Loading } from "../ui/primitives";
import { Dropzone, type useUploader } from "./UploadDropzone";
import { zhMedia } from "../../lib/zh-media-settings";

const MediaPage = lazy(async () => ({ default: (await import("../../pages/MediaPage")).MediaPage }));

export function MediaDrawer({ uploads, notice, onPlay, onClose }: {
  uploads: ReturnType<typeof useUploader>;
  notice?: string;
  onPlay(id: string): void;
  onClose(): void;
}) {
  return (
    <Drawer open title={zhMedia.title} width={600} onClose={onClose} wrapContents={contents => (
      <Dropzone className="flex flex-1 min-h-0 flex-col" label="拖放文件以添加" notice={notice}
        onFiles={uploads.start} onPaths={uploads.startPaths}>
        {contents}
      </Dropzone>
    )}>
      <Suspense fallback={<Loading label="正在打开媒体…" />}><MediaPage uploads={uploads} onPlay={onPlay} /></Suspense>
    </Drawer>
  );
}
