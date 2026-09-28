"""Cut the leader figure out of a BBG portrait medallion.

BBG portraits are round medallions: the leader is drawn over a dark, textured
disc, so the image alpha only gives a circle. This module separates the figure
from the disc with OpenCV GrabCut, seeded as follows (h/w: image size,
(cx, cy, R): disc centre and radius estimated from the opaque area):

- sure background: fully transparent pixels, and pixels of the disc's outer
  ring (0.86R-0.97R, upper part) whose Lab colour is close (< 18) to the
  median colour of that ring;
- sure foreground: an ellipse on the face, and the bottom-centre of the disc
  (chest);
- probable foreground: the lower part of the disc (body) and anything drawn
  above the disc edge (hair, hats);
- probable background: the rest.

The largest connected component is kept and its holes are filled.
The seed geometry is a heuristic tuned by eye on the BBG portraits: the result
is automatic and can be imperfect (shoulders, hair edges).
"""
import cv2, numpy as np, json, sys
from PIL import Image
def cut(path):
    """Return a uint8 mask (255 = figure) for the portrait at ``path``."""
    im=np.array(Image.open(path).convert("RGBA")); rgb=cv2.cvtColor(im[:,:,:3],cv2.COLOR_RGB2BGR); a=im[:,:,3]
    h,w=a.shape; ys,xs=np.nonzero(a>128)
    cx=(xs.min()+xs.max())/2; R=(xs.max()-xs.min())/2; cy=ys.max()-R
    Y,X=np.mgrid[0:h,0:w]; r=np.hypot(X-cx,Y-cy)
    lab=cv2.cvtColor(rgb,cv2.COLOR_BGR2LAB).astype(np.float32)
    ring=(r>0.86*R)&(r<0.97*R)&(Y<cy+0.2*R)&(a>128)
    med=np.median(lab[ring],axis=0)
    dist=np.linalg.norm(lab-med,axis=2)
    mask=np.full((h,w),cv2.GC_PR_BGD,np.uint8)
    mask[(Y>cy+0.35*R)]=cv2.GC_PR_FGD                                  # lower part: body likely
    mask[ring&(dist<18)]=cv2.GC_BGD                                    # ring pixels with background colour
    mask[(r>=0.97*R)&(Y<cy)&(a>128)]=cv2.GC_PR_FGD                     # overflow above the disc edge (hair/hat)
    fg=((X-cx)/(0.26*R))**2+((Y-(cy-0.05*R))/(0.38*R))**2<1
    mask[fg]=cv2.GC_FGD
    mask[(Y>cy+0.8*R)&(np.abs(X-cx)<0.35*R)&(a>128)]=cv2.GC_FGD
    mask[a<128]=cv2.GC_BGD
    bgd=np.zeros((1,65),np.float64); fgd=np.zeros((1,65),np.float64)
    cv2.grabCut(rgb,mask,None,bgd,fgd,8,cv2.GC_INIT_WITH_MASK)
    m=np.where((mask==cv2.GC_FGD)|(mask==cv2.GC_PR_FGD),255,0).astype(np.uint8)
    m=cv2.morphologyEx(m,cv2.MORPH_OPEN,np.ones((3,3),np.uint8))
    n,labl,st,_=cv2.connectedComponentsWithStats(m)
    if n>1: k=1+np.argmax(st[1:,cv2.CC_STAT_AREA]); m=np.where(labl==k,255,0).astype(np.uint8)
    # fill holes
    inv=cv2.bitwise_not(m); n,labl,st,_=cv2.connectedComponentsWithStats(inv)
    for i in range(1,n):
        x0,y0,ww,hh,_=st[i]
        if x0>0 and y0>0 and x0+ww<w and y0+hh<h: m[labl==i]=255
    return m
