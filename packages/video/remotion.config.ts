import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("png");
Config.setPixelFormat("yuv420p10le");
Config.setCodec("h264");
Config.setCrf(16);
Config.setOverwriteOutput(true);
