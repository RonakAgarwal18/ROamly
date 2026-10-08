import { Module } from '@nestjs/common';
import { RoamlyPhotosRepository } from './roamly-photos.repository';

/**
 * The roamly_photos store on its own, so both halves can have it without
 * importing each other.
 *
 * Memories needs it to record a row when an album sync pulls provider assets
 * in; the /api/photos read surface needs the memories resolver to fetch the
 * bytes. That is a genuine mutual need, and a module this small breaks it
 * without a forwardRef: PhotosModule -> MemoriesModule -> RoamlyPhotosModule is
 * a straight line.
 */
@Module({
  providers: [RoamlyPhotosRepository],
  exports: [RoamlyPhotosRepository],
})
export class RoamlyPhotosModule {}
