import { Module } from '@nestjs/common';
import { PhotosController } from './photos.controller';
import { PhotosService } from './photos.service';
import { RoamlyPhotosModule } from './roamly-photos.module';
import { MemoriesModule } from '../memories/memories.module';

/**
 * /api/photos — the roamly_photo read surface. Access control and the byte
 * fetching both come from the memories domain, which owns provider dispatch;
 * the row store comes from RoamlyPhotosModule, which memories imports too. That
 * shared leaf is what keeps this a straight line instead of a forwardRef.
 */
@Module({
  imports: [RoamlyPhotosModule, MemoriesModule],
  controllers: [PhotosController],
  providers: [PhotosService],
  exports: [RoamlyPhotosModule],
})
export class PhotosModule {}
