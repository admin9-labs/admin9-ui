import type { FilePickerAdapter } from '../src';
import { type AcceptanceState } from './fake-media-service';
import createFakeFileManagerService from './fake-file-manager-service';

export default function createFakeFilePickerService(state: AcceptanceState): FilePickerAdapter {
  const service = createFakeFileManagerService(state);
  return {
    async list(params) {
      const result = await service.list(params);
      return {
        ...result,
        list: result.list.map((item) =>
          item.id === 'file-image-2'
            ? {
                ...item,
                name: `responsive-layout-${'very-long-file-name-'.repeat(8)}.svg`,
                extension: `svg-${'ext'.repeat(28)}`,
                mime: `image/svg+xml;profile=${'metadata'.repeat(24)}`,
              }
            : item
        ),
      };
    },
    listGroups: (fileType) => service.listGroups(fileType),
    upload: (options) => service.upload(options),
  };
}
