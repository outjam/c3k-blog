export interface PostImage {
  src: string;
  alt: string;
  caption?: string;
  width: number;
  height: number;
}

export interface PostVideo {
  src: string;
  poster?: string;
  caption?: string;
}

export interface PostAudio {
  src: string;
  title: string;
  caption?: string;
}

export interface PostModel3D {
  src: string;
  iosSrc?: string;
  poster?: string;
  alt: string;
  caption?: string;
}

export type TsxDemoId = "webapp-ready" | "theme-chip" | "haptic-actions";
export type AnimationDemoId = "parallax-cards" | "reading-progress" | "pulse-grid";

export type PostContentBlock =
  | {
      type: "paragraph";
      text: string;
    }
  | {
      type: "heading";
      text: string;
    }
  | {
      type: "quote";
      text: string;
      author?: string;
    }
  | {
      type: "image";
      image: PostImage;
    }
  | {
      type: "gallery";
      title?: string;
      images: PostImage[];
    }
  | {
      type: "video";
      video: PostVideo;
    }
  | {
      type: "audio";
      audio: PostAudio;
    }
  | {
      type: "model3d";
      model: PostModel3D;
    }
  | {
      type: "tsx";
      title: string;
      code: string;
      demoId: TsxDemoId;
    }
  | {
      type: "animation";
      title: string;
      caption?: string;
      demoId: AnimationDemoId;
    }
  | {
      type: "list";
      ordered?: boolean;
      items: string[];
    };

export interface BlogPost {
  slug: string;
  title: string;
  excerpt: string;
  tags: string[];
  cardVariant: "feature" | "glass" | "minimal";
  publishedAt: string;
  readTime: string;
  cover: PostImage;
  content: PostContentBlock[];
}
